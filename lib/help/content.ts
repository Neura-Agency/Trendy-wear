import type { HelpLang } from "./voice";

export interface HelpEntry {
  title?: string;
  what: string;
  steps?: string[];
  why?: string;
  target?: string;
}

type HelpCatalog = Record<string, HelpEntry>;

/** Contextual help. Inventory is global/shared; stores are sales/reporting identities. */
const en: HelpCatalog = {
  "dashboard.kpis": {
    title: "Your business at a glance",
    what: "These totals summarise sales, costs, profit and stock for the period you have selected.",
    steps: [
      "Pick the period you want to review at the top of the page.",
      "Read the cards left to right: revenue, costs, then profit.",
      "Click the Expenses card to see what makes up that cost.",
    ],
    why: "Everything here is calculated from your recorded orders, so it changes as soon as sales, returns or expenses are added.",
  },
  "dashboard.storePartners": {
    title: "Store partners",
    what: "See how each partner shop is performing and settle their orders.",
    steps: [
      "Find the shop you want in the list.",
      "Use its row actions to open its details and sales.",
      "Mark orders as paid once you have received the money.",
    ],
  },
  "dashboard.partnerSales": {
    title: "Partner store sales",
    what: "Every order recorded by your partner shops. Stores identify who made a sale; they do not own separate stock pools.",
    steps: [
      "Choose a period and shop in the filters above the table.",
      "Search by item or order to narrow the list further.",
      "Click a row to open the full order details.",
    ],
  },
  "dashboard.recordSale": {
    title: "Record a sale",
    what: "Enter a sale so the shared inventory, order and profit stay correct.",
    steps: [
      "Click Record Sale to open the form.",
      "Select the item, then enter quantity and selling price.",
      "Save — available global stock drops and revenue and profit update.",
    ],
    why: "All stores sell from the same physical inventory pool. The selected store records who made the sale, not who owns the stock.",
  },
  "dashboard.expensesSection": {
    title: "Money spent",
    what: "Costs recorded against this period.",
    steps: [
      "Review the listed costs for the selected period.",
      "Click Add Expense for anything not already captured.",
      "Enter the amount and a short description, then save.",
    ],
  },

  "inventory.page": {
    title: "Global inventory",
    what: "All physical stock belongs to one shared inventory pool. Stores can sell available stock without receiving separate inventory ownership.",
    steps: [
      "Add incoming stock to the global inventory with its cost and quantity.",
      "Use the inventory view to check available quantities and batches.",
      "Record store sales against the global pool; the store remains attached to the order for reporting and commission.",
    ],
    why: "There is no store-owned stock layer. This keeps one authoritative physical stock balance for the business.",
  },
  "inventory.warehouse": {
    title: "Global stock",
    what: "Physical inventory batches currently available to the business.",
    steps: [
      "Add incoming stock with its cost, quantity and variants.",
      "Use the batch information to understand where available stock came from.",
      "Sales reduce the shared available quantity regardless of which store made the sale.",
    ],
    why: "The inventory batch cost is used for cost-of-goods and profit analysis.",
  },
  "inventory.storeStock": {
    title: "Shared inventory for stores",
    what: "Stores do not have separate inventory balances. They view the same global stock pool and their sales are linked to their store identity.",
    steps: [
      "Use store filters when you want to analyse sales, not inventory ownership.",
      "Use the global inventory view to check available stock.",
      "Use orders and reports to see what each store has sold.",
    ],
    why: "A store is a sales/reporting entity, not an inventory-ownership entity.",
  },
  "inventory.allot": {
    title: "Global inventory",
    what: "Inventory is shared across stores. Stock is no longer moved into a separate store-owned pool.",
    steps: [
      "Add stock to the global inventory with its cost and quantity.",
      "Let stores sell available stock through their normal sales flow.",
      "Use store sales and reports to track performance and commission.",
    ],
    why: "Removing the allotment layer prevents the same physical inventory from being split into competing store balances.",
  },
  "inventory.gifts": {
    title: "Gifts & extras",
    what: "Extra units can be dispatched as free/bonus quantities while still coming from the shared physical inventory.",
    steps: [
      "Enter bonus units on the sale when applicable.",
      "The global inventory engine deducts the physical units.",
      "The order keeps the bonus quantity so it is not lost from the sales record.",
    ],
    why: "Bonus units affect physical stock even when they are not billed as normal sale quantity.",
  },
  "inventory.allInventory": {
    title: "All global inventory",
    what: "A read-only view of the business's shared physical inventory and its batches.",
    steps: [
      "Use search and filters to find an item.",
      "Review available quantity and batch information.",
      "Use store sales reports separately when you need store-level performance.",
    ],
  },

  "directSales.page": {
    title: "Direct sales",
    what: "Sales you made yourself, without a partner shop. They still consume the same global inventory pool.",
    steps: [
      "Click Record Direct Sale.",
      "Pick the item from global inventory and enter quantity and price.",
      "Save — shared stock drops and the direct-sale margin is recorded.",
    ],
    why: "Direct sales have no partner-store commission, but they use the same physical inventory as every other sale.",
  },

  "owners.page": {
    title: "Profit partners",
    what: "Partners share the business profit by percentage.",
    steps: [
      "Check each partner's share of the current net profit.",
      "Record a payout when you pay a partner.",
      "Use transfers for money moved between partners.",
    ],
  },
  "owners.split": {
    title: "Profit split",
    what: "Each partner's share is their percentage of the current net profit.",
    steps: [
      "Confirm the percentages match your real agreement.",
      "Edit a percentage only when that agreement actually changes.",
    ],
  },
  "owners.payouts": {
    title: "Payouts",
    what: "Record money actually paid to a partner.",
    steps: [
      "Click Add Payout and select the partner.",
      "Enter the amount paid and the date.",
      "Save — it is deducted from their remaining share straight away.",
    ],
  },
  "owners.transfers": {
    title: "Owner transfers",
    what: "Money moved between partners or into the business.",
    steps: [
      "Choose who the money came from and who received it.",
      "Enter the amount and save.",
    ],
    why: "Recording a transfer keeps each partner's balance correct without touching profit.",
  },

  "expenses.page": {
    title: "Expenses",
    what: "All costs pulled from your orders — item cost, commissions and shipment charges — plus anything you add manually.",
    steps: [
      "Select the period you want to review.",
      "Click Add Expense for a cost the system cannot know about.",
      "Enter amount, date and description, then save.",
    ],
    why: "These costs are subtracted from revenue to give the net profit shown on the dashboard.",
  },
  "returns.page": {
    title: "Returns",
    what: "Orders where a physical item came back and should return to the shared global inventory.",
    steps: [
      "Find the order in the list.",
      "Mark the physical return with its quantity and variant details.",
      "The returned stock goes back into global inventory rather than a store-owned balance.",
    ],
  },
  "refunds.page": {
    title: "Refunds",
    what: "Financial refunds are separate from physical stock returns.",
    steps: [
      "Find the order you refunded.",
      "Record the financial refund — stock stays unchanged when the customer keeps the item.",
      "When an item is physically returned, record the return so global inventory increases.",
    ],
    why: "Keeping financial refunds separate from physical returns prevents stock counts from drifting.",
  },
  "profit.page": {
    title: "Profit analysis",
    what: "Revenue minus item cost, commissions, shipping and expenses, order by order.",
    steps: [
      "Choose the period and shop you want to analyse.",
      "Scan the profit column to spot orders that earned little or nothing.",
    ],
  },
  "reports.page": {
    title: "Reports",
    what: "Build a report from the figures already recorded in the system.",
    steps: [
      "Pick the period and any filters you need.",
      "Review the totals on screen.",
      "Click Print or Save to keep a copy.",
    ],
  },
  "credentials.page": {
    title: "Shop credentials",
    what: "Login accounts for each shop.",
    steps: [
      "Click Add Account when a new shop joins.",
      "Set the username and password for that shop.",
      "Reveal a password only when you need to share it.",
    ],
    why: "Each shop can use these details to access the sales and inventory information allowed for its account.",
  },
};

/** Roman Urdu — same keys and meaning, with global inventory terminology. */
const romanUr: HelpCatalog = {
  "dashboard.kpis": {
    title: "Business ka khulasa",
    what: "Yeh totals aap ke chune gaye period ki sales, cost, profit aur stock dikhate hain.",
    steps: [
      "Upar se period select karein.",
      "Cards ko baayen se daayen parhein: revenue, cost, phir profit.",
      "Expenses card par click karein to cost ki tafseel dekhein.",
    ],
    why: "Yeh aap ke recorded orders aur expenses se calculate hota hai.",
  },
  "dashboard.storePartners": {
    title: "Store partners",
    what: "Har partner shop ki performance dekhein aur un ke orders settle karein.",
    steps: [
      "List mein shop dhoondein.",
      "Us ki details aur sales kholein.",
      "Paisa milne par order ko paid mark karein.",
    ],
  },
  "dashboard.partnerSales": {
    title: "Partner store sales",
    what: "Partner shops ke tamam orders. Store sirf yeh batata hai ke sale kis ne ki; stock us ka apna pool nahi hota.",
    steps: [
      "Period aur shop filter karein.",
      "Item ya order search karein.",
      "Poori tafseel ke liye row par click karein.",
    ],
  },
  "dashboard.recordSale": {
    title: "Sale record karein",
    what: "Sale darj karein taake shared inventory, order aur profit sahi rahein.",
    steps: [
      "Record Sale par click karein.",
      "Item, quantity aur selling price likhein.",
      "Save karein — global available stock kam hoga aur profit update hoga.",
    ],
    why: "Har store aik hi physical global inventory se sale karta hai.",
  },
  "dashboard.expensesSection": {
    title: "Kharch",
    what: "Is period ke tamam kharche.",
    steps: [
      "Period ke kharche dekhein.",
      "Jo kharch shamil nahi us ke liye Add Expense dabayein.",
      "Amount aur tafseel likh kar save karein.",
    ],
  },
  "inventory.page": {
    title: "Global inventory",
    what: "Business ka tamam physical stock aik shared inventory pool mein hota hai. Shops ka alag owned stock nahi hota.",
    steps: [
      "Naya stock cost aur quantity ke sath global inventory mein add karein.",
      "Inventory view se available quantity aur batches dekhein.",
      "Store ki sale global stock se deduct hoti hai aur order mein store ka naam record hota hai.",
    ],
    why: "Aik hi physical stock balance hone se duplicate ya conflicting store balances nahi bante.",
  },
  "inventory.warehouse": {
    title: "Global stock",
    what: "Business ke paas mojood physical inventory batches.",
    steps: [
      "Incoming stock ko cost, quantity aur variants ke sath add karein.",
      "Batch information se available stock ka source dekhein.",
      "Kisi bhi store ki sale isi shared quantity ko kam karti hai.",
    ],
    why: "Batch cost profit aur COGS ke liye use hoti hai.",
  },
  "inventory.storeStock": {
    title: "Stores ke liye shared inventory",
    what: "Stores ka alag inventory balance nahi. Sab aik hi global stock pool dekhte hain.",
    steps: [
      "Store filter sales analysis ke liye use karein.",
      "Available stock ke liye global inventory dekhein.",
      "Store ki performance ke liye orders aur reports dekhein.",
    ],
    why: "Store sales/reporting entity hai, inventory owner nahi.",
  },
  "inventory.allot": {
    title: "Global inventory",
    what: "Stock ab kisi store ke alag owned pool mein allot nahi hota. Sab stores available global stock se sale karte hain.",
    steps: [
      "Stock ko cost aur quantity ke sath global inventory mein add karein.",
      "Normal sales flow se available stock sell karein.",
      "Store sales aur reports se performance aur commission track karein.",
    ],
    why: "Allotment layer hatane se aik physical stock ko multiple store balances mein divide karne ka masla khatam hota hai.",
  },
  "inventory.gifts": {
    title: "Gifts aur extras",
    what: "Free ya bonus units bhi shared physical inventory se nikalte hain.",
    steps: [
      "Sale ke waqt bonus units likhein.",
      "Global inventory engine physical units deduct karega.",
      "Order mein bonus quantity save rahegi.",
    ],
    why: "Bonus unit billed na ho tab bhi physical stock kam hota hai.",
  },
  "inventory.allInventory": {
    title: "Tamam global inventory",
    what: "Business ke shared physical stock aur batches ka read-only view.",
    steps: [
      "Search aur filters se item dhoondein.",
      "Available quantity aur batch information dekhein.",
      "Store performance ke liye sales reports alag se dekhein.",
    ],
  },
  "directSales.page": {
    title: "Direct sales",
    what: "Woh sales jo aap ne khud ki, magar stock phir bhi global inventory se hi nikalta hai.",
    steps: [
      "Record Direct Sale par click karein.",
      "Global inventory se item chunein aur quantity aur price likhein.",
      "Save karein — shared stock kam hoga aur direct sale ka margin record hoga.",
    ],
    why: "Direct sale par partner-store commission nahi hoti, lekin physical inventory shared rehti hai.",
  },
  "owners.page": {
    title: "Profit partners",
    what: "Partners business profit percentage ke hisaab se baantte hain.",
    steps: [
      "Har partner ka mojooda hissa dekhein.",
      "Paisa dene par payout record karein.",
      "Partners ke darmiyan paisay ke liye transfer use karein.",
    ],
  },
  "owners.split": {
    title: "Profit split",
    what: "Har partner ka hissa net profit ka us ka percentage hai.",
    steps: [
      "Check karein percentage asli agreement se milta hai.",
      "Percentage sirf agreement badalne par edit karein.",
    ],
  },
  "owners.payouts": {
    title: "Payouts",
    what: "Partner ko diya gaya paisa record karein.",
    steps: [
      "Add Payout par click kar ke partner chunein.",
      "Amount aur date likhein.",
      "Save karein.",
    ],
  },
  "owners.transfers": {
    title: "Owner transfers",
    what: "Partners ke darmiyan ya business mein paisay ki movement.",
    steps: [
      "Paisa kis ne diya aur kis ko mila, chunein.",
      "Amount likh kar save karein.",
    ],
    why: "Transfer balance sahi rakhta hai aur profit ko change nahi karta.",
  },
  "expenses.page": {
    title: "Expenses",
    what: "Orders ki item cost, commission, shipment aur manual kharche.",
    steps: [
      "Period select karein.",
      "System se bahar ke kharch ke liye Add Expense dabayein.",
      "Amount, date aur tafseel likh kar save karein.",
    ],
    why: "Yeh cost revenue se minus ho kar net profit banati hai.",
  },
  "returns.page": {
    title: "Returns",
    what: "Woh orders jin ka physical maal wapas aya aur global inventory mein jana chahiye.",
    steps: [
      "List mein order dhoondein.",
      "Return ki quantity aur variant details record karein.",
      "Returned stock global inventory mein wapas jata hai.",
    ],
  },
  "refunds.page": {
    title: "Refunds",
    what: "Financial refund aur physical stock return alag cheezen hain.",
    steps: [
      "Refund wala order dhoondein.",
      "Agar customer maal rakhta hai to financial refund record karein aur stock change na karein.",
      "Agar maal physically wapas aya hai to return record karein taake global stock barhe.",
    ],
    why: "Refund aur return ko alag rakhne se stock sahi rehta hai.",
  },
  "profit.page": {
    title: "Profit analysis",
    what: "Revenue mein se item cost, commission, shipping aur expenses minus kar ke profit.",
    steps: [
      "Period aur shop chunein.",
      "Profit column se kam kamane wale orders dekhein.",
    ],
  },
  "reports.page": {
    title: "Reports",
    what: "System mein record ki hui figures se report banayein.",
    steps: [
      "Period aur filters chunein.",
      "Totals check karein.",
      "Print ya Save dabayein.",
    ],
  },
  "credentials.page": {
    title: "Shop credentials",
    what: "Har shop ke login accounts.",
    steps: [
      "Nayi shop par Add Account dabayein.",
      "Username aur password set karein.",
      "Password sirf zaroorat par reveal karein.",
    ],
    why: "Account se shop ko us ki allowed sales aur inventory information milti hai.",
  },
};

const catalog: Partial<Record<HelpLang, HelpCatalog>> = {
  en,
  "roman-ur": romanUr,
};

export function getHelp(id: string, lang: HelpLang = "en"): HelpEntry | null {
  return catalog[lang]?.[id] ?? catalog.en?.[id] ?? null;
}

export default catalog;
