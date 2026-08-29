BEGIN;

-- ============================================================
-- TRENDY WEAR
-- GLOBAL SHARED INVENTORY ENGINE
-- Engine Version: 2
-- ============================================================


-- ============================================================
-- 1. SETTINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.settings (key, value)
VALUES ('inventoryEngineVersion', '2'::jsonb)
ON CONFLICT (key)
DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now();


-- ============================================================
-- 2. ORDERS - REQUIRED GLOBAL INVENTORY COLUMNS
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS inventory_id uuid NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS created_by uuid NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS extra_qty integer NOT NULL DEFAULT 0;


-- Add FK only if it does not already exist
DO $fn$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_inventory_id_fkey'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_inventory_id_fkey
            FOREIGN KEY (inventory_id)
            REFERENCES public.inventory(id)
            ON DELETE SET NULL;
    END IF;
END
$fn$;


DO $fn$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_created_by_fkey'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_created_by_fkey
            FOREIGN KEY (created_by)
            REFERENCES public.accounts(id)
            ON DELETE SET NULL;
    END IF;
END
$fn$;


-- ============================================================
-- 3. ORDER -> GLOBAL INVENTORY ALLOCATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_inventory_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id uuid NOT NULL
        REFERENCES public.orders(id)
        ON DELETE CASCADE,

    inventory_id uuid NOT NULL
        REFERENCES public.inventory(id)
        ON DELETE RESTRICT,

    quantity integer NOT NULL DEFAULT 0
        CHECK (quantity >= 0),

    bonus_quantity integer NOT NULL DEFAULT 0
        CHECK (bonus_quantity >= 0),

    returned_quantity integer NOT NULL DEFAULT 0
        CHECK (returned_quantity >= 0),

    unit_cost numeric(12,2) NOT NULL DEFAULT 0,

    variant_quantities jsonb,

    allocation_type text NOT NULL DEFAULT 'sale'
        CHECK (allocation_type IN ('sale', 'replacement')),

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT order_inventory_allocations_positive_units
        CHECK (quantity + bonus_quantity > 0)
);

CREATE INDEX IF NOT EXISTS
    idx_order_inventory_allocations_order
ON public.order_inventory_allocations(order_id);

CREATE INDEX IF NOT EXISTS
    idx_order_inventory_allocations_inventory
ON public.order_inventory_allocations(inventory_id);

CREATE INDEX IF NOT EXISTS
    idx_order_inventory_allocations_type
ON public.order_inventory_allocations(allocation_type);


-- ============================================================
-- 4. REPLACEMENT ORIGINAL-ITEM RESTOCK ALLOCATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_replacement_restock_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id uuid NOT NULL
        REFERENCES public.orders(id)
        ON DELETE CASCADE,

    inventory_id uuid NOT NULL
        REFERENCES public.inventory(id)
        ON DELETE RESTRICT,

    quantity integer NOT NULL
        CHECK (quantity > 0),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS
    idx_order_replacement_restock_order
ON public.order_replacement_restock_allocations(order_id);

CREATE INDEX IF NOT EXISTS
    idx_order_replacement_restock_inventory
ON public.order_replacement_restock_allocations(inventory_id);


-- ============================================================
-- 5. SALE IDEMPOTENCY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_sale_idempotency (
    request_key text PRIMARY KEY,

    order_id uuid NOT NULL
        REFERENCES public.orders(id)
        ON DELETE RESTRICT,

    created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 6. GLOBAL SALE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.sell_from_inventory(
    p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$

DECLARE
    v_request_key text :=
        nullif(trim(p_payload->>'request_key'), '');

    v_engine_version integer :=
        coalesce((p_payload->>'engine_version')::integer, 0);

    v_deployed_version integer;

    v_store_id uuid :=
        nullif(p_payload->>'store_id', '')::uuid;

    v_product_id uuid :=
        nullif(p_payload->>'product_id', '')::uuid;

    v_product_name text :=
        trim(coalesce(p_payload->>'product_name', ''));

    v_quantity integer :=
        greatest(
            0,
            coalesce((p_payload->>'quantity')::integer, 0)
        );

    v_bonus integer :=
        greatest(
            0,
            coalesce((p_payload->>'extra_qty')::integer, 0)
        );

    v_total integer :=
        v_quantity + v_bonus;

    v_price numeric :=
        coalesce((p_payload->>'selling_price')::numeric, 0);

    v_deductions numeric :=
        greatest(
            0,
            coalesce((p_payload->>'shipment_cost')::numeric, 0)
            +
            coalesce((p_payload->>'extra_charges')::numeric, 0)
        );

    v_client text :=
        nullif(p_payload->>'client_name', '');

    v_order_type text :=
        coalesce(
            nullif(p_payload->>'order_type', ''),
            'Sale'
        );

    v_occurred_at timestamptz :=
        coalesce(
            (p_payload->>'occurred_at')::timestamptz,
            now()
        );

    v_order_code text :=
        nullif(
            trim(p_payload->>'order_code'),
            ''
        );

    v_store_name text;

    v_commission numeric(5,2);

    v_commission_amount numeric;

    v_gross numeric;

    v_admin_take numeric;

    v_cost_sold numeric := 0;

    v_cost_physical numeric := 0;

    v_available integer := 0;

    v_remaining integer;

    v_remaining_sold integer;

    v_remaining_bonus integer;

    v_order_id uuid;

    v_created_by uuid :=
        nullif(p_payload->>'created_by', '')::uuid;

    v_existing_order uuid;

    v_primary_inventory_id uuid;

    v_row record;

    v_take integer;

    v_bonus_take integer;

    v_sold_take integer;

    v_code text;

BEGIN

    -- --------------------------------------------------------
    -- Engine version validation
    -- --------------------------------------------------------

    IF v_engine_version = 0 THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'INVENTORY_ENGINE_VERSION_REQUIRED';
    END IF;


    SELECT
        CASE
            WHEN jsonb_typeof(value) = 'number'
                THEN (value #>> '{}')::integer
            WHEN jsonb_typeof(value) = 'string'
                THEN trim(both '"' from value::text)::integer
            ELSE NULL
        END
    INTO v_deployed_version
    FROM public.settings
    WHERE key = 'inventoryEngineVersion';


    IF v_deployed_version IS NULL
       OR v_deployed_version <> v_engine_version
    THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = format(
                    'INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',
                    v_engine_version,
                    coalesce(v_deployed_version, -1)
                );
    END IF;


    -- --------------------------------------------------------
    -- Validation
    -- --------------------------------------------------------

    IF v_request_key IS NULL THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'SALE_REQUEST_KEY_REQUIRED';
    END IF;


    IF v_store_id IS NULL THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'STORE_ID_REQUIRED';
    END IF;


    IF v_quantity < 1 THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'QUANTITY_MUST_BE_AT_LEAST_ONE';
    END IF;


    IF v_price <= 0 THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'SELLING_PRICE_MUST_BE_POSITIVE';
    END IF;


    -- --------------------------------------------------------
    -- Idempotency
    -- --------------------------------------------------------

    SELECT order_id
    INTO v_existing_order
    FROM public.inventory_sale_idempotency
    WHERE request_key = v_request_key;


    IF v_existing_order IS NOT NULL THEN

        SELECT order_code
        INTO v_code
        FROM public.orders
        WHERE id = v_existing_order;

        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'order_id', v_existing_order,
            'order_code', v_code
        );

    END IF;


    -- --------------------------------------------------------
    -- Store
    -- --------------------------------------------------------

    SELECT
        name,
        commission
    INTO
        v_store_name,
        v_commission
    FROM public.stores
    WHERE id = v_store_id
    FOR SHARE;


    IF v_store_name IS NULL THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'STORE_NOT_FOUND';
    END IF;


    -- --------------------------------------------------------
    -- Product
    -- --------------------------------------------------------

    IF v_product_id IS NULL THEN

        SELECT id
        INTO v_product_id
        FROM public.products
        WHERE product_name = v_product_name
        ORDER BY id
        LIMIT 1;

    END IF;


    IF v_product_id IS NULL THEN
        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'PRODUCT_NOT_FOUND';
    END IF;


    -- --------------------------------------------------------
    -- Phase 1
    -- Lock FIFO inventory and verify all required stock exists.
    -- --------------------------------------------------------

    FOR v_row IN

        SELECT
            id,
            quantity_available,
            cost_price

        FROM public.inventory

        WHERE product_id = v_product_id
          AND quantity_available > 0

        ORDER BY created_at ASC, id ASC

        FOR UPDATE

    LOOP

        EXIT WHEN v_available >= v_total;


        v_take :=
            least(
                v_row.quantity_available,
                v_total - v_available
            );


        IF v_available < v_quantity THEN

            v_cost_sold :=
                v_cost_sold
                +
                (
                    v_row.cost_price
                    *
                    least(
                        v_take,
                        v_quantity - v_available
                    )
                );

        END IF;


        v_cost_physical :=
            v_cost_physical
            +
            (
                v_row.cost_price
                *
                v_take
            );


        IF v_primary_inventory_id IS NULL THEN
            v_primary_inventory_id := v_row.id;
        END IF;


        v_available :=
            v_available + v_take;

    END LOOP;


    IF v_available < v_total THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = format(
                    'INSUFFICIENT_GLOBAL_STOCK: available=%s requested=%s',
                    v_available,
                    v_total
                );

    END IF;


    -- --------------------------------------------------------
    -- Financial calculation
    -- --------------------------------------------------------

    v_gross :=
        v_price * v_quantity;


    v_commission_amount :=
        round(
            (v_gross - v_deductions)
            *
            v_commission
            / 100,
            2
        );


    v_admin_take :=
        (v_gross - v_deductions)
        -
        v_commission_amount;


    IF v_order_code IS NULL THEN

        v_order_code :=
            'ORD-'
            ||
            upper(
                substr(
                    md5(gen_random_uuid()::text),
                    1,
                    12
                )
            );

    END IF;


    -- --------------------------------------------------------
    -- Create order
    -- --------------------------------------------------------

    INSERT INTO public.orders (
        order_code,
        store_id,
        product_id,
        inventory_id,
        store_inventory_id,
        product_name,
        quantity,
        size_quantities,
        color_quantities,
        variant_quantities,
        selling_price,
        shipment_cost,
        client_name,
        order_type,
        occurred_at,
        included_in_payout,
        commission_percent,
        cost_price,
        commission_amount,
        admin_take,
        profit,
        extra_qty,
        created_by
    )

    VALUES (
        v_order_code,
        v_store_id,
        v_product_id,
        v_primary_inventory_id,
        NULL,
        v_product_name,
        v_quantity,
        p_payload->'size_quantities',
        p_payload->'color_quantities',
        p_payload->'variant_quantities',
        v_price,
        v_deductions,
        v_client,
        v_order_type,
        v_occurred_at,
        false,
        v_commission,

        CASE
            WHEN v_quantity > 0
            THEN round(v_cost_sold / v_quantity, 2)
            ELSE 0
        END,

        v_commission_amount,

        v_admin_take,

        v_admin_take - v_cost_sold,

        v_bonus,
        v_created_by
    )

    RETURNING id
    INTO v_order_id;


    -- --------------------------------------------------------
    -- Phase 2
    -- Consume exact FIFO batches.
    -- --------------------------------------------------------

    v_remaining := v_total;

    v_remaining_sold := v_quantity;

    v_remaining_bonus := v_bonus;


    FOR v_row IN

        SELECT
            id,
            quantity_available,
            cost_price

        FROM public.inventory

        WHERE product_id = v_product_id
          AND quantity_available > 0

        ORDER BY created_at ASC, id ASC

        FOR UPDATE

    LOOP

        EXIT WHEN v_remaining <= 0;


        v_take :=
            least(
                v_row.quantity_available,
                v_remaining
            );


        v_sold_take :=
            least(
                v_remaining_sold,
                v_take
            );


        v_bonus_take :=
            v_take - v_sold_take;


        UPDATE public.inventory

        SET
            quantity_available =
                quantity_available - v_take,
            updated_at = now()

        WHERE id = v_row.id
          AND quantity_available >= v_take;


        IF NOT FOUND THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = 'INVENTORY_CONCURRENT_UPDATE';

        END IF;


        INSERT INTO public.order_inventory_allocations (
            order_id,
            inventory_id,
            quantity,
            bonus_quantity,
            unit_cost,
            variant_quantities,
            allocation_type
        )

        VALUES (
            v_order_id,
            v_row.id,
            v_sold_take,
            v_bonus_take,
            v_row.cost_price,

            CASE
                WHEN v_row.id = v_primary_inventory_id
                THEN p_payload->'variant_quantities'
                ELSE NULL
            END,

            'sale'
        );


        v_remaining :=
            v_remaining - v_take;

        v_remaining_sold :=
            v_remaining_sold - v_sold_take;

        v_remaining_bonus :=
            v_remaining_bonus - v_bonus_take;

    END LOOP;


    IF v_remaining > 0
       OR v_remaining_sold > 0
       OR v_remaining_bonus > 0
    THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'INVENTORY_DEDUCTION_INCOMPLETE';

    END IF;


    -- --------------------------------------------------------
    -- Idempotency record
    -- --------------------------------------------------------

    INSERT INTO public.inventory_sale_idempotency (
        request_key,
        order_id
    )

    VALUES (
        v_request_key,
        v_order_id
    );


    RETURN jsonb_build_object(
        'success', true,
        'duplicate', false,
        'order_id', v_order_id,
        'order_code', v_order_code,
        'store_name', v_store_name,
        'commission_percent', v_commission
    );


EXCEPTION
    WHEN unique_violation THEN

        SELECT order_id
        INTO v_existing_order
        FROM public.inventory_sale_idempotency
        WHERE request_key = v_request_key;


        IF v_existing_order IS NOT NULL THEN

            SELECT order_code
            INTO v_code
            FROM public.orders
            WHERE id = v_existing_order;


            RETURN jsonb_build_object(
                'success', true,
                'duplicate', true,
                'order_id', v_existing_order,
                'order_code', v_code
            );

        END IF;


        RAISE;

END;

$fn$;


REVOKE ALL
ON FUNCTION public.sell_from_inventory(jsonb)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.sell_from_inventory(jsonb)
TO service_role;


-- ============================================================
-- 7. RETURN ORDER TO GLOBAL INVENTORY
-- ============================================================

CREATE OR REPLACE FUNCTION public.return_order_to_global_inventory(
    p_order_id uuid,
    p_return_qty integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$

DECLARE

    v_remaining integer :=
        greatest(0, coalesce(p_return_qty, 0));

    v_returned integer := 0;

    v_row record;

    v_take integer;

BEGIN

    IF v_remaining < 1 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'RETURN_QUANTITY_MUST_BE_POSITIVE';

    END IF;


    FOR v_row IN

        SELECT
            id,
            inventory_id,
            quantity,
            bonus_quantity,
            returned_quantity

        FROM public.order_inventory_allocations

        WHERE order_id = p_order_id

          AND allocation_type = 'sale'

          AND (
                quantity
                +
                bonus_quantity
                -
                returned_quantity
              ) > 0

        ORDER BY created_at ASC, id ASC

        FOR UPDATE

    LOOP

        EXIT WHEN v_remaining <= 0;


        v_take :=
            least(
                v_row.quantity
                +
                v_row.bonus_quantity
                -
                v_row.returned_quantity,
                v_remaining
            );


        UPDATE public.inventory

        SET
            quantity_available =
                quantity_available + v_take,
            updated_at = now()

        WHERE id = v_row.inventory_id;


        IF NOT FOUND THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = 'INVENTORY_BATCH_NOT_FOUND';

        END IF;


        UPDATE public.order_inventory_allocations

        SET
            returned_quantity =
                returned_quantity + v_take

        WHERE id = v_row.id;


        v_remaining :=
            v_remaining - v_take;

        v_returned :=
            v_returned + v_take;

    END LOOP;


    IF v_remaining > 0 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = format(
                    'RETURN_EXCEEDS_SOLD_ALLOCATION: remaining=%s',
                    v_remaining
                );

    END IF;


    RETURN jsonb_build_object(
        'returned',
        v_returned
    );

END;

$fn$;


REVOKE ALL
ON FUNCTION public.return_order_to_global_inventory(uuid, integer)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.return_order_to_global_inventory(uuid, integer)
TO service_role;


-- ============================================================
-- 8. FULL ORDER RETURN TRANSACTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_global_order_return(
    p_payload jsonb,
    p_engine_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$

DECLARE

    v_order public.orders%rowtype;

    v_qty integer;

    v_already integer;

    v_remaining integer;

    v_new_return integer;

    v_gross numeric;

    v_commission numeric;

    v_admin numeric;

    v_profit numeric;

    v_result jsonb;

    v_deployed_version integer;

BEGIN

    SELECT
        CASE
            WHEN jsonb_typeof(value) = 'number'
                THEN (value #>> '{}')::integer
            WHEN jsonb_typeof(value) = 'string'
                THEN trim(both '"' from value::text)::integer
            ELSE NULL
        END

    INTO v_deployed_version

    FROM public.settings

    WHERE key = 'inventoryEngineVersion';


    IF p_engine_version = 0
       OR v_deployed_version IS NULL
       OR v_deployed_version <> p_engine_version
    THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = format(
                    'INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',
                    p_engine_version,
                    coalesce(v_deployed_version, -1)
                );

    END IF;


    SELECT *
    INTO v_order

    FROM public.orders

    WHERE id =
        nullif(
            p_payload->>'order_id',
            ''
        )::uuid

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'ORDER_NOT_FOUND';

    END IF;


    v_already :=
        greatest(
            0,
            coalesce(v_order.return_quantity, 0)
        );


    v_remaining :=
        greatest(
            0,
            v_order.quantity - v_already
        );


    v_qty :=
        least(
            greatest(
                0,
                coalesce(
                    (p_payload->>'return_quantity')::integer,
                    v_remaining
                )
            ),
            v_remaining
        );


    IF v_qty < 1 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'RETURN_QUANTITY_MUST_BE_POSITIVE';

    END IF;


    v_result :=
        public.return_order_to_global_inventory(
            v_order.id,
            v_qty
        );


    v_new_return :=
        v_already + v_qty;


    v_gross :=
        v_order.selling_price
        *
        greatest(
            0,
            v_order.quantity - v_new_return
        )
        -
        v_order.shipment_cost;


    v_commission :=
        round(
            greatest(0, v_gross)
            *
            coalesce(v_order.commission_percent, 0)
            / 100,
            2
        );


    v_admin :=
        greatest(0, v_gross)
        -
        v_commission;


    v_profit :=
        v_admin
        -
        coalesce(v_order.cost_price, 0)
        *
        greatest(
            0,
            v_order.quantity - v_new_return
        );


    UPDATE public.orders

    SET
        order_returned =
            (v_new_return >= v_order.quantity),

        profit =
            greatest(0, v_profit),

        admin_take =
            greatest(0, v_admin),

        commission_amount =
            greatest(0, v_commission),

        return_quantity =
            v_new_return,

        return_reason =
            nullif(
                p_payload->>'return_reason',
                ''
            ),

        return_size_quantities =
            p_payload->'return_size_quantities',

        return_color_quantities =
            p_payload->'return_color_quantities',

        return_variant_quantities =
            p_payload->'return_variant_quantities',

        returned_at = now(),

        return_proof_url =
            nullif(
                p_payload->>'return_proof_url',
                ''
            )

    WHERE id = v_order.id;


    RETURN jsonb_build_object(
        'success', true,
        'returned', v_qty,
        'order_id', v_order.id
    );

END;

$fn$;


REVOKE ALL
ON FUNCTION public.process_global_order_return(jsonb, integer)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.process_global_order_return(jsonb, integer)
TO service_role;


-- ============================================================
-- 9. UNDO GLOBAL ORDER RETURN
-- ============================================================

CREATE OR REPLACE FUNCTION public.undo_global_order_return(
    p_order_id uuid,
    p_engine_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$

DECLARE

    v_order public.orders%rowtype;

    v_deployed_version integer;

    v_remaining integer;

    v_row record;

    v_take integer;

    v_undone integer := 0;

    v_new_return integer;

    v_gross numeric;

    v_commission numeric;

    v_admin numeric;

    v_profit numeric;

BEGIN

    SELECT
        CASE
            WHEN jsonb_typeof(value) = 'number'
                THEN (value #>> '{}')::integer
            WHEN jsonb_typeof(value) = 'string'
                THEN trim(both '"' from value::text)::integer
            ELSE NULL
        END

    INTO v_deployed_version

    FROM public.settings

    WHERE key = 'inventoryEngineVersion';


    IF p_engine_version = 0
       OR v_deployed_version IS NULL
       OR v_deployed_version <> p_engine_version
    THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = format(
                    'INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',
                    p_engine_version,
                    coalesce(v_deployed_version, -1)
                );

    END IF;


    SELECT *
    INTO v_order

    FROM public.orders

    WHERE id = p_order_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'ORDER_NOT_FOUND';

    END IF;


    v_remaining :=
        greatest(
            0,
            coalesce(v_order.return_quantity, 0)
        );


    IF v_remaining < 1 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'ORDER_HAS_NO_RETURN';

    END IF;


    FOR v_row IN

        SELECT
            id,
            inventory_id,
            returned_quantity

        FROM public.order_inventory_allocations

        WHERE order_id = p_order_id

          AND allocation_type = 'sale'

          AND returned_quantity > 0

        ORDER BY created_at DESC, id DESC

        FOR UPDATE

    LOOP

        EXIT WHEN v_remaining <= 0;


        v_take :=
            least(
                v_row.returned_quantity,
                v_remaining
            );


        UPDATE public.inventory

        SET
            quantity_available =
                quantity_available - v_take,
            updated_at = now()

        WHERE id = v_row.inventory_id

          AND quantity_available >= v_take;


        IF NOT FOUND THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = 'UNDO_RETURN_INSUFFICIENT_GLOBAL_STOCK';

        END IF;


        UPDATE public.order_inventory_allocations

        SET
            returned_quantity =
                returned_quantity - v_take

        WHERE id = v_row.id;


        v_remaining :=
            v_remaining - v_take;

        v_undone :=
            v_undone + v_take;

    END LOOP;


    IF v_remaining > 0 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'RETURN_ALLOCATION_NOT_FOUND';

    END IF;


    v_new_return :=
        greatest(
            0,
            coalesce(v_order.return_quantity, 0)
            -
            v_undone
        );


    v_gross :=
        v_order.selling_price
        *
        greatest(
            0,
            v_order.quantity - v_new_return
        )
        -
        v_order.shipment_cost;


    v_commission :=
        round(
            greatest(0, v_gross)
            *
            coalesce(v_order.commission_percent, 0)
            / 100,
            2
        );


    v_admin :=
        greatest(0, v_gross)
        -
        v_commission;


    v_profit :=
        v_admin
        -
        coalesce(v_order.cost_price, 0)
        *
        greatest(
            0,
            v_order.quantity - v_new_return
        );


    UPDATE public.orders

    SET
        order_returned = false,

        return_quantity =
            CASE
                WHEN v_new_return = 0
                THEN NULL
                ELSE v_new_return
            END,

        return_reason =
            CASE
                WHEN v_new_return = 0
                THEN NULL
                ELSE return_reason
            END,

        return_size_quantities =
            CASE
                WHEN v_new_return = 0
                THEN NULL
                ELSE return_size_quantities
            END,

        return_color_quantities =
            CASE
                WHEN v_new_return = 0
                THEN NULL
                ELSE return_color_quantities
            END,

        return_variant_quantities =
            CASE
                WHEN v_new_return = 0
                THEN NULL
                ELSE return_variant_quantities
            END,

        returned_at =
            CASE
                WHEN v_new_return = 0
                THEN NULL
                ELSE returned_at
            END,

        return_proof_url =
            CASE
                WHEN v_new_return = 0
                THEN NULL
                ELSE return_proof_url
            END,

        profit =
            greatest(0, v_profit),

        admin_take =
            greatest(0, v_admin),

        commission_amount =
            greatest(0, v_commission)

    WHERE id = p_order_id;


    RETURN jsonb_build_object(
        'success', true,
        'undone', v_undone,
        'order_id', p_order_id
    );

END;

$fn$;


REVOKE ALL
ON FUNCTION public.undo_global_order_return(uuid, integer)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.undo_global_order_return(uuid, integer)
TO service_role;


-- ============================================================
-- 10. RESTOCK ORIGINAL ITEM FOR REPLACEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.restock_order_original_for_replacement(
    p_order_id uuid,
    p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$

DECLARE

    v_remaining integer :=
        greatest(0, coalesce(p_quantity, 0));

    v_total integer := 0;

    v_row record;

    v_take integer;

BEGIN

    IF v_remaining < 1 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'RESTOCK_QUANTITY_MUST_BE_POSITIVE';

    END IF;


    FOR v_row IN

        SELECT
            id,
            inventory_id,
            quantity,
            bonus_quantity,
            returned_quantity

        FROM public.order_inventory_allocations

        WHERE order_id = p_order_id

        ORDER BY created_at DESC, id DESC

        FOR UPDATE

    LOOP

        EXIT WHEN v_remaining <= 0;


        v_take :=
            least(
                v_remaining,
                greatest(
                    0,
                    v_row.quantity
                    +
                    v_row.bonus_quantity
                    -
                    v_row.returned_quantity
                )
            );


        IF v_take > 0 THEN

            UPDATE public.inventory

            SET
                quantity_available =
                    quantity_available + v_take,
                updated_at = now()

            WHERE id = v_row.inventory_id;


            IF NOT FOUND THEN

                RAISE EXCEPTION
                    USING
                        errcode = 'P0001',
                        message = 'INVENTORY_BATCH_NOT_FOUND';

            END IF;


            v_remaining :=
                v_remaining - v_take;

            v_total :=
                v_total + v_take;

        END IF;

    END LOOP;


    IF v_remaining > 0 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'RESTOCK_ALLOCATION_NOT_FOUND';

    END IF;


    RETURN jsonb_build_object(
        'success', true,
        'restocked', v_total
    );

END;

$fn$;


REVOKE ALL
ON FUNCTION public.restock_order_original_for_replacement(uuid, integer)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.restock_order_original_for_replacement(uuid, integer)
TO service_role;


-- ============================================================
-- 11. GLOBAL REFUND / REPLACEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_global_refund(
    p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$

DECLARE

    v_order public.orders%rowtype;

    v_engine_version integer :=
        coalesce(
            (p_payload->>'engine_version')::integer,
            0
        );

    v_deployed_version integer;

    v_method text :=
        coalesce(
            nullif(
                p_payload->>'refund_type',
                ''
            ),
            'quantity'
        );

    v_ref_qty integer;

    v_original_qty integer;

    v_returned_qty integer;

    v_refunded_qty integer;

    v_remaining_qty integer;

    v_fixed_amount numeric :=
        greatest(
            0,
            coalesce(
                (p_payload->>'fixed_amount')::numeric,
                0
            )
        );

    v_new_refund_qty integer;

    v_refund_amount numeric := 0;

    v_replacement_qty integer :=
        greatest(
            1,
            coalesce(
                (p_payload->>'replacement_quantity')::integer,
                1
            )
        );

    v_replacement_product_id uuid :=
        nullif(
            p_payload->>'replacement_product_id',
            ''
        )::uuid;

    v_replacement_cost numeric := 0;

    v_replacement_remaining integer;

    v_row record;

    v_take integer;

    v_restock_remaining integer;

    v_gross numeric;

    v_commission numeric;

    v_admin numeric;

    v_profit numeric;

BEGIN

    -- --------------------------------------------------------
    -- Engine version
    -- --------------------------------------------------------

    SELECT
        CASE
            WHEN jsonb_typeof(value) = 'number'
                THEN (value #>> '{}')::integer
            WHEN jsonb_typeof(value) = 'string'
                THEN trim(both '"' from value::text)::integer
            ELSE NULL
        END

    INTO v_deployed_version

    FROM public.settings

    WHERE key = 'inventoryEngineVersion';


    IF v_engine_version = 0
       OR v_deployed_version IS NULL
       OR v_deployed_version <> v_engine_version
    THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = format(
                    'INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',
                    v_engine_version,
                    coalesce(v_deployed_version, -1)
                );

    END IF;


    -- --------------------------------------------------------
    -- Lock order
    -- --------------------------------------------------------

    SELECT *
    INTO v_order

    FROM public.orders

    WHERE id =
        nullif(
            p_payload->>'order_id',
            ''
        )::uuid

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'ORDER_NOT_FOUND';

    END IF;


    v_original_qty :=
        greatest(
            0,
            coalesce(v_order.quantity, 0)
        );


    v_returned_qty :=
        greatest(
            0,
            coalesce(v_order.return_quantity, 0)
        );


    v_refunded_qty :=
        greatest(
            0,
            coalesce(v_order.refund_quantity, 0)
        );


    v_remaining_qty :=
        greatest(
            0,
            v_original_qty
            -
            v_returned_qty
            -
            v_refunded_qty
        );


    IF v_remaining_qty < 1 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'NO_REMAINING_UNITS';

    END IF;


    -- --------------------------------------------------------
    -- Determine refund quantity
    -- --------------------------------------------------------

    IF v_method = 'amount' THEN

        IF v_fixed_amount <= 0 THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = 'FIXED_REFUND_AMOUNT_REQUIRED';

        END IF;


        v_ref_qty :=
            least(
                v_remaining_qty,
                greatest(
                    1,
                    coalesce(
                        (p_payload->>'refund_quantity')::integer,
                        v_remaining_qty
                    )
                )
            );


    ELSIF v_method = 'replacement' THEN

        IF v_replacement_product_id IS NULL THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = 'REPLACEMENT_PRODUCT_REQUIRED';

        END IF;


        v_ref_qty :=
            least(
                v_remaining_qty,
                greatest(
                    1,
                    coalesce(
                        (p_payload->>'refund_quantity')::integer,
                        1
                    )
                )
            );


    ELSE

        v_ref_qty :=
            least(
                v_remaining_qty,
                greatest(
                    1,
                    coalesce(
                        (p_payload->>'refund_quantity')::integer,
                        v_remaining_qty
                    )
                )
            );

    END IF;


    IF v_ref_qty < 1 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'REFUND_QUANTITY_MUST_BE_POSITIVE';

    END IF;


    v_new_refund_qty :=
        v_refunded_qty + v_ref_qty;


    -- --------------------------------------------------------
    -- Replacement inventory
    -- --------------------------------------------------------

    IF v_method = 'replacement' THEN

        v_replacement_remaining :=
            v_replacement_qty;


        FOR v_row IN

            SELECT
                id,
                quantity_available,
                cost_price

            FROM public.inventory

            WHERE product_id =
                v_replacement_product_id

              AND quantity_available > 0

            ORDER BY created_at ASC, id ASC

            FOR UPDATE

        LOOP

            EXIT WHEN v_replacement_remaining <= 0;


            v_take :=
                least(
                    v_row.quantity_available,
                    v_replacement_remaining
                );


            UPDATE public.inventory

            SET
                quantity_available =
                    quantity_available - v_take,
                updated_at = now()

            WHERE id = v_row.id

              AND quantity_available >= v_take;


            IF NOT FOUND THEN

                RAISE EXCEPTION
                    USING
                        errcode = 'P0001',
                        message = 'INVENTORY_CONCURRENT_UPDATE';

            END IF;


            INSERT INTO public.order_inventory_allocations (
                order_id,
                inventory_id,
                quantity,
                bonus_quantity,
                unit_cost,
                allocation_type
            )

            VALUES (
                v_order.id,
                v_row.id,
                v_take,
                0,
                v_row.cost_price,
                'replacement'
            );


            v_replacement_cost :=
                v_replacement_cost
                +
                (
                    v_row.cost_price
                    *
                    v_take
                );


            v_replacement_remaining :=
                v_replacement_remaining - v_take;

        END LOOP;


        IF v_replacement_remaining > 0 THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = format(
                        'INSUFFICIENT_GLOBAL_STOCK: replacement_available=%s replacement_requested=%s',
                        v_replacement_qty - v_replacement_remaining,
                        v_replacement_qty
                    );

        END IF;


        -- ----------------------------------------------------
        -- Original item returned
        -- ----------------------------------------------------

        IF coalesce(
            (p_payload->>'original_item_returned')::boolean,
            false
        ) THEN

            v_restock_remaining :=
                v_ref_qty;


            FOR v_row IN

                SELECT
                    id,
                    inventory_id,
                    quantity,
                    bonus_quantity,
                    returned_quantity

                FROM public.order_inventory_allocations

                WHERE order_id = v_order.id

                  AND allocation_type = 'sale'

                  AND (
                        quantity
                        +
                        bonus_quantity
                        -
                        returned_quantity
                      ) > 0

                ORDER BY created_at DESC, id DESC

                FOR UPDATE

            LOOP

                EXIT WHEN v_restock_remaining <= 0;


                v_take :=
                    least(
                        v_restock_remaining,
                        v_row.quantity
                        +
                        v_row.bonus_quantity
                        -
                        v_row.returned_quantity
                    );


                UPDATE public.inventory

                SET
                    quantity_available =
                        quantity_available + v_take,
                    updated_at = now()

                WHERE id = v_row.inventory_id;


                IF NOT FOUND THEN

                    RAISE EXCEPTION
                        USING
                            errcode = 'P0001',
                            message = 'INVENTORY_BATCH_NOT_FOUND';

                END IF;


                INSERT INTO public.order_replacement_restock_allocations (
                    order_id,
                    inventory_id,
                    quantity
                )

                VALUES (
                    v_order.id,
                    v_row.inventory_id,
                    v_take
                );


                v_restock_remaining :=
                    v_restock_remaining - v_take;

            END LOOP;


            IF v_restock_remaining > 0 THEN

                RAISE EXCEPTION
                    USING
                        errcode = 'P0001',
                        message = 'RESTOCK_ALLOCATION_NOT_FOUND';

            END IF;

        END IF;

    END IF;


    -- --------------------------------------------------------
    -- Refund amount
    -- --------------------------------------------------------

    IF v_method = 'amount' THEN

        v_refund_amount :=
            coalesce(v_order.refund_amount, 0)
            +
            v_fixed_amount;


    ELSIF v_method = 'replacement' THEN

        v_refund_amount := 0;


    ELSE

        v_refund_amount :=
            coalesce(v_order.refund_amount, 0)
            +
            v_order.selling_price * v_ref_qty;

    END IF;


    -- --------------------------------------------------------
    -- Financial calculations
    -- --------------------------------------------------------

    v_gross :=
        v_order.selling_price
        *
        greatest(
            0,
            v_original_qty - v_returned_qty
        )
        -
        v_order.shipment_cost
        -
        CASE
            WHEN v_method = 'amount'
            THEN v_fixed_amount
            ELSE 0
        END;


    IF v_method = 'quantity' THEN

        v_gross :=
            v_order.selling_price
            *
            greatest(
                0,
                v_original_qty
                -
                v_returned_qty
                -
                v_new_refund_qty
            )
            -
            v_order.shipment_cost;

    END IF;


    v_commission :=
        round(
            greatest(0, v_gross)
            *
            coalesce(
                v_order.commission_percent,
                0
            )
            / 100,
            2
        );


    v_admin :=
        greatest(0, v_gross)
        -
        v_commission;


    IF v_method = 'replacement'
       AND coalesce(
            (p_payload->>'original_item_returned')::boolean,
            false
       )
    THEN

        v_profit :=
            v_admin
            -
            coalesce(v_order.cost_price, 0)
            *
            greatest(
                0,
                v_original_qty
                -
                v_returned_qty
                -
                v_new_refund_qty
            )
            -
            v_replacement_cost;


    ELSIF v_method = 'replacement' THEN

        v_profit :=
            v_admin
            -
            coalesce(v_order.cost_price, 0)
            *
            greatest(
                0,
                v_original_qty
                -
                v_returned_qty
            )
            -
            v_replacement_cost;


    ELSE

        v_profit :=
            v_admin
            -
            coalesce(v_order.cost_price, 0)
            *
            greatest(
                0,
                v_original_qty
                -
                v_returned_qty
            );

    END IF;


    -- --------------------------------------------------------
    -- Update order
    -- --------------------------------------------------------

    UPDATE public.orders

    SET
        profit =
            greatest(0, v_profit),

        admin_take =
            greatest(0, v_admin),

        commission_amount =
            greatest(0, v_commission),

        refund_quantity =
            v_new_refund_qty,

        refund_amount =
            v_refund_amount,

        refund_type =
            v_method,

        replacement_item =
            CASE
                WHEN v_method = 'replacement'
                THEN nullif(
                    p_payload->>'replacement_item',
                    ''
                )
                ELSE NULL
            END,

        replacement_product_id =
            CASE
                WHEN v_method = 'replacement'
                THEN v_replacement_product_id
                ELSE NULL
            END,

        replacement_quantity =
            CASE
                WHEN v_method = 'replacement'
                THEN v_replacement_qty
                ELSE NULL
            END,

        replacement_size =
            CASE
                WHEN v_method = 'replacement'
                THEN nullif(
                    p_payload->>'replacement_size',
                    ''
                )
                ELSE NULL
            END,

        replacement_color =
            CASE
                WHEN v_method = 'replacement'
                THEN nullif(
                    p_payload->>'replacement_color',
                    ''
                )
                ELSE NULL
            END,

        original_item_returned =
            CASE
                WHEN v_method = 'replacement'
                THEN coalesce(
                    (p_payload->>'original_item_returned')::boolean,
                    false
                )
                ELSE NULL
            END,

        refund_reason =
            CASE
                WHEN v_method = 'replacement'
                THEN concat(
                    'Replacement: ',
                    coalesce(
                        nullif(
                            p_payload->>'replacement_item',
                            ''
                        ),
                        'Replacement'
                    )
                )
                ELSE nullif(
                    p_payload->>'refund_reason',
                    ''
                )
            END,

        refund_size_quantities =
            p_payload->'refund_size_quantities',

        refund_color_quantities =
            p_payload->'refund_color_quantities',

        refund_variant_quantities =
            p_payload->'refund_variant_quantities',

        refunded_at =
            now(),

        refund_proof_url =
            nullif(
                p_payload->>'refund_proof_url',
                ''
            )

    WHERE id = v_order.id;


    RETURN jsonb_build_object(
        'success', true,
        'refund_amount', v_refund_amount,
        'replacement_cost_total', v_replacement_cost,
        'replacement_consumed_inventory_ids',
        coalesce(
            (
                SELECT jsonb_agg(inventory_id)
                FROM public.order_inventory_allocations
                WHERE order_id = v_order.id
                  AND allocation_type = 'replacement'
            ),
            '[]'::jsonb
        )
    );

END;

$fn$;


REVOKE ALL
ON FUNCTION public.process_global_refund(jsonb)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.process_global_refund(jsonb)
TO service_role;


-- ============================================================
-- 12. UNDO GLOBAL REFUND / REPLACEMENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.undo_global_refund(
    p_order_id uuid,
    p_engine_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$

DECLARE

    v_order public.orders%rowtype;

    v_deployed_version integer;

    v_row record;

    v_restored integer := 0;

    v_gross numeric;

    v_commission numeric;

    v_admin numeric;

    v_profit numeric;

BEGIN

    SELECT
        CASE
            WHEN jsonb_typeof(value) = 'number'
                THEN (value #>> '{}')::integer
            WHEN jsonb_typeof(value) = 'string'
                THEN trim(both '"' from value::text)::integer
            ELSE NULL
        END

    INTO v_deployed_version

    FROM public.settings

    WHERE key = 'inventoryEngineVersion';


    IF p_engine_version = 0
       OR v_deployed_version IS NULL
       OR v_deployed_version <> p_engine_version
    THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = format(
                    'INVENTORY_ENGINE_VERSION_MISMATCH: app=%s db=%s',
                    p_engine_version,
                    coalesce(v_deployed_version, -1)
                );

    END IF;


    SELECT *
    INTO v_order

    FROM public.orders

    WHERE id = p_order_id

    FOR UPDATE;


    IF NOT FOUND THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'ORDER_NOT_FOUND';

    END IF;


    IF coalesce(v_order.refund_quantity, 0) < 1 THEN

        RAISE EXCEPTION
            USING
                errcode = 'P0001',
                message = 'NO_REFUND_TO_UNDO';

    END IF;


    -- --------------------------------------------------------
    -- Remove replacement inventory from exact batches
    -- --------------------------------------------------------

    FOR v_row IN

        SELECT
            id,
            inventory_id,
            quantity

        FROM public.order_inventory_allocations

        WHERE order_id = p_order_id

          AND allocation_type = 'replacement'

        ORDER BY created_at DESC, id DESC

        FOR UPDATE

    LOOP

        UPDATE public.inventory

        SET
            quantity_available =
                quantity_available - v_row.quantity,
            updated_at = now()

        WHERE id = v_row.inventory_id

          AND quantity_available >= v_row.quantity;


        IF NOT FOUND THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = 'INSUFFICIENT_GLOBAL_STOCK';

        END IF;


        v_restored :=
            v_restored + v_row.quantity;


        DELETE FROM public.order_inventory_allocations

        WHERE id = v_row.id;

    END LOOP;


    -- --------------------------------------------------------
    -- Reverse original-item replacement restock
    -- --------------------------------------------------------

    FOR v_row IN

        SELECT
            id,
            inventory_id,
            quantity

        FROM public.order_replacement_restock_allocations

        WHERE order_id = p_order_id

        ORDER BY created_at DESC, id DESC

        FOR UPDATE

    LOOP

        UPDATE public.inventory

        SET
            quantity_available =
                quantity_available - v_row.quantity,
            updated_at = now()

        WHERE id = v_row.inventory_id

          AND quantity_available >= v_row.quantity;


        IF NOT FOUND THEN

            RAISE EXCEPTION
                USING
                    errcode = 'P0001',
                    message = 'INSUFFICIENT_GLOBAL_STOCK';

        END IF;


        DELETE FROM public.order_replacement_restock_allocations

        WHERE id = v_row.id;

    END LOOP;


    -- --------------------------------------------------------
    -- Restore financial state
    -- --------------------------------------------------------

    v_gross :=
        v_order.selling_price
        *
        greatest(
            0,
            v_order.quantity
            -
            coalesce(v_order.return_quantity, 0)
        )
        -
        v_order.shipment_cost;


    v_commission :=
        round(
            greatest(0, v_gross)
            *
            coalesce(
                v_order.commission_percent,
                0
            )
            / 100,
            2
        );


    v_admin :=
        greatest(0, v_gross)
        -
        v_commission;


    v_profit :=
        v_admin
        -
        coalesce(v_order.cost_price, 0)
        *
        greatest(
            0,
            v_order.quantity
            -
            coalesce(v_order.return_quantity, 0)
        );


    UPDATE public.orders

    SET
        profit =
            greatest(0, v_profit),

        admin_take =
            greatest(0, v_admin),

        commission_amount =
            greatest(0, v_commission),

        refund_quantity = NULL,

        refund_amount = NULL,

        refund_type = NULL,

        replacement_item = NULL,

        replacement_product_id = NULL,

        replacement_quantity = NULL,

        replacement_size = NULL,

        replacement_color = NULL,

        original_item_returned = NULL,

        refund_reason = NULL,

        refund_size_quantities = NULL,

        refund_color_quantities = NULL,

        refund_variant_quantities = NULL,

        refunded_at = NULL,

        refund_proof_url = NULL

    WHERE id = p_order_id;


    RETURN jsonb_build_object(
        'success', true,
        'restored', v_restored
    );

END;

$fn$;


REVOKE ALL
ON FUNCTION public.undo_global_refund(uuid, integer)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.undo_global_refund(uuid, integer)
TO service_role;


-- ============================================================
-- 13. FINAL ENGINE VERSION
-- ============================================================

INSERT INTO public.settings (
    key,
    value
)

VALUES (
    'inventoryEngineVersion',
    '2'::jsonb
)

ON CONFLICT (key)

DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = now();


COMMIT;


-- ============================================================
-- 14. VERIFICATION
-- ============================================================

SELECT
    key,
    value
FROM public.settings
WHERE key = 'inventoryEngineVersion';


SELECT
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN (
      'inventory_id',
      'created_by',
      'extra_qty'
  )
ORDER BY column_name;


SELECT
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
      'sell_from_inventory',
      'return_order_to_global_inventory',
      'process_global_order_return',
      'undo_global_order_return',
      'restock_order_original_for_replacement',
      'process_global_refund',
      'undo_global_refund'
  )
ORDER BY routine_name;