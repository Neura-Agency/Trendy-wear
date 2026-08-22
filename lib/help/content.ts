import type { HelpLang } from "./voice";

export interface HelpEntry {
  /** Short heading of the popover. */
  title?: string;
  /** What should I do here / what happens. 1–2 sentences. */
  what: string;
  /** Step-by-step guidance for this screen or action. */
  steps?: string[];
  /** Optional "Why?" — only where it genuinely helps. */
  why?: string;
  /** Optional CSS selector of an existing control to point at ("Show me"). */
  target?: string;
}

type HelpCatalog = Record<string, HelpEntry>;

/**
 * Contextual help copy, keyed by location id.
 * Language-ready: additional languages sit next to `en` / `roman-ur`
 * without touching any component.
 */
const en: HelpCatalog = {
  /* ── Dashboard ── */
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
      "Use its row actions to allot stock or open its details.",
      "Mark orders as paid once you have received the money.",
    ],
  },
  "dashboard.partnerSales": {
    title: "Partner store sales",
    what: "Every order recorded by your partner shops.",
    steps: [
      "Choose a period and shop in the filters above the table.",
      "Search by item or order to narrow the list further.",
      "Click a row to open the full order details.",
    ],
  },
  "dashboard.recordSale": {
    title: "Record a sale",
    what: "Enter a sale you made so stock and profit stay correct.",
    steps: [
      "Click Record Sale to open the form.",
      "Select the item, then enter quantity and selling price.",
      "Save — the shop's stock drops and revenue and profit update.",
    ],
    why: "Recording sales here is what keeps stock counts and profit reports accurate.",
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

  /* ── Inventory ── */
  "inventory.page": {
    title: "Stock & inventory",
    what: "Add stock to the warehouse, then allot it to the shops that will sell it.",
    steps: [
      "Add the item to warehouse stock with its cost and quantity.",
      "Choose Allot to Store and pick the shop.",
      "Enter quantity per colour and size, then save the allotment.",
    ],
  },
  "inventory.warehouse": {
    title: "Warehouse stock",
    what: "Everything you own that has not been sent to a shop yet.",
    steps: [
      "Click Add Item and fill in name, cost and quantity.",
      "Add colours and sizes so allotments can be split correctly.",
      "Use Edit on a row to correct cost or quantity later.",
    ],
    why: "Item cost recorded here is what the profit reports use as cost of goods.",
  },
  "inventory.storeStock": {
    title: "Stock with shops",
    what: "Stock already supplied to partner shops and still unsold.",
    steps: [
      "Pick a shop to see exactly what it is holding.",
      "Compare allotted quantity against items sold.",
      "Allot more stock when a shop is running low.",
    ],
  },
  "inventory.allot": {
    title: "Allot to store",
    what: "Move warehouse stock to a shop so the shop can sell it.",
    steps: [
      "Enter how many units of each colour and size the shop gets — the remaining count is shown under each box.",
      "Set the partner commission percentage for these items.",
      "Add any extra gift units, then click Save Allotment.",
    ],
    why: "The commission you set here is used to calculate the shop's share on every sale of these items.",
  },
  "inventory.gifts": {
    title: "Gifts & extras",
    what: "Extra units given to a shop free of charge.",
    steps: [
      "Enter gift units while allotting stock to a shop.",
      "Check them here to see their cost impact.",
    ],
    why: "Their cost is counted as an expense, not as a sale.",
  },
  "inventory.allInventory": {
    title: "All warehouse inventory",
    what: "A read-only view of everything held in the warehouse, including what has been supplied to shops.",
    steps: [
      "Use search and filters to find an item.",
      "Read the columns to see warehouse, allotted and sold quantities.",
    ],
  },

  /* ── Direct sales ── */
  "directSales.page": {
    title: "Direct sales",
    what: "Sales you made yourself, without a partner shop.",
    steps: [
      "Click Record Direct Sale.",
      "Pick the item from warehouse stock and enter quantity and price.",
      "Save — warehouse stock drops and the full margin is your profit.",
    ],
    why: "No shop commission is applied to direct sales, so the profit share differs from partner orders.",
  },

  /* ── Profit partners ── */
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

  /* ── Expenses / returns / refunds / profit ── */
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
    what: "Orders where the item came back to the warehouse.",
    steps: [
      "Find the order in the list.",
      "Mark it as returned — stock goes back in and the sale stops counting as revenue.",
    ],
  },
  "refunds.page": {
    title: "Refunds",
    what: "Orders where money was returned but the customer kept the item.",
    steps: [
      "Find the order you refunded.",
      "Record the refund — revenue is reversed while the stock stays sold.",
    ],
    why: "Keeping refunds separate from returns is what stops stock counts drifting.",
  },
  "profit.page": {
    title: "Profit analysis",
    what: "Revenue minus item cost, commissions, shipping and expenses, order by order.",
    steps: [
      "Choose the period and shop you want to analyse.",
      "Scan the profit column to spot orders that earned little or nothing.",
    ],
  },

  /* ── Reports & credentials ── */
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
    why: "Each shop only sees its own stock and sales when it signs in with these details.",
  },
};

/** Roman Urdu — same keys, same meaning, spoken-friendly wording. */
const romanUr: HelpCatalog = {
  "dashboard.kpis": {
    title: "Business ka khulasa",
    what: "Yeh totals aap ke chune gaye period ki sales, cost, profit aur stock dikhate hain.",
    steps: [
      "Sab se pehle upar se period select karein.",
      "Cards ko baayen se daayen parhein: revenue, cost, phir profit.",
      "Expenses card par click karein to dekhein woh cost kis se bani hai.",
    ],
    why: "Yeh sab aap ke record kiye orders se calculate hota hai, is liye nayi sale ya expense par foran badal jata hai.",
  },
  "dashboard.storePartners": {
    title: "Store partners",
    what: "Har partner shop ki performance dekhein aur un ke orders settle karein.",
    steps: [
      "List mein apni shop dhoondein.",
      "Us row ke actions se stock allot karein ya details kholein.",
      "Paisa mil jaane par order ko paid mark karein.",
    ],
  },
  "dashboard.partnerSales": {
    title: "Partner store sales",
    what: "Aap ki partner shops ke record kiye hue tamam orders.",
    steps: [
      "Filters se period aur shop chunein.",
      "Item ya order search kar ke list chhoti karein.",
      "Poori tafseel ke liye row par click karein.",
    ],
  },
  "dashboard.recordSale": {
    title: "Sale record karein",
    what: "Ki gayi sale darj karein taake stock aur profit sahi rahein.",
    steps: [
      "Record Sale par click karein.",
      "Item chunein, phir quantity aur selling price likhein.",
      "Save karein — shop ka stock kam ho jayega aur profit update ho jayega.",
    ],
    why: "Sale yahan record karna hi stock aur profit reports ko drust rakhta hai.",
  },
  "dashboard.expensesSection": {
    title: "Kharch",
    what: "Is period ke tamam kharche.",
    steps: [
      "Chune gaye period ke kharche dekhein.",
      "Jo kharch shamil nahi, us ke liye Add Expense dabayein.",
      "Amount aur chhoti tafseel likh kar save karein.",
    ],
  },
  "inventory.page": {
    title: "Stock aur inventory",
    what: "Pehle warehouse mein stock daalein, phir shops ko allot karein.",
    steps: [
      "Item ko cost aur quantity ke sath warehouse mein add karein.",
      "Allot to Store chunein aur shop select karein.",
      "Har colour aur size ki quantity likh kar allotment save karein.",
    ],
  },
  "inventory.warehouse": {
    title: "Warehouse stock",
    what: "Woh maal jo abhi kisi shop ko nahi bheja gaya.",
    steps: [
      "Add Item par click karein aur naam, cost, quantity likhein.",
      "Colour aur size zaroor daalein taake allotment sahi bant sake.",
      "Baad mein cost ya quantity theek karne ke liye Edit use karein.",
    ],
    why: "Yahan likhi cost hi profit reports mein cost of goods bunti hai.",
  },
  "inventory.storeStock": {
    title: "Shops ka stock",
    what: "Woh stock jo shops ko de diya gaya hai aur abhi bika nahi.",
    steps: [
      "Shop chunein aur dekhein us ke paas kya mojood hai.",
      "Allot ki hui quantity aur bike hue items ka moqabla karein.",
      "Stock kam ho to mazeed allot karein.",
    ],
  },
  "inventory.allot": {
    title: "Store ko allot karein",
    what: "Warehouse ka stock shop ko dein taake woh bech sake.",
    steps: [
      "Har colour aur size ke saamne quantity likhein — neeche bacha hua stock likha hota hai.",
      "Partner commission percentage set karein.",
      "Extra gift units daalein, phir Save Allotment dabayein.",
    ],
    why: "Yahan set ki gayi commission hi har sale par shop ka hissa nikalti hai.",
  },
  "inventory.gifts": {
    title: "Gifts aur extras",
    what: "Woh extra units jo shop ko muft di gayi hain.",
    steps: [
      "Allotment ke waqt gift units likhein.",
      "Yahan un ka cost asar dekhein.",
    ],
    why: "In ki cost expense mein ginti hai, sale mein nahi.",
  },
  "inventory.allInventory": {
    title: "Tamam warehouse inventory",
    what: "Sirf parhne ke liye view — warehouse ka sab maal, shops ko diya gaya bhi.",
    steps: [
      "Search aur filters se item dhoondein.",
      "Columns se warehouse, allotted aur sold quantity dekhein.",
    ],
  },
  "directSales.page": {
    title: "Direct sales",
    what: "Woh sales jo aap ne khud ki, kisi partner shop ke baghair.",
    steps: [
      "Record Direct Sale par click karein.",
      "Warehouse se item chunein aur quantity aur price likhein.",
      "Save karein — warehouse stock kam hoga aur poora margin aap ka profit hai.",
    ],
    why: "Direct sale par shop commission nahi lagti, is liye profit ka hissa mukhtalif hota hai.",
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
      "Check karein ke percentage asli agreement se milta hai.",
      "Percentage sirf tab badlein jab agreement waqai badle.",
    ],
  },
  "owners.payouts": {
    title: "Payouts",
    what: "Partner ko diya gaya paisa record karein.",
    steps: [
      "Add Payout par click kar ke partner chunein.",
      "Di gayi amount aur date likhein.",
      "Save karein — yeh foran un ke bache hue hisse se kat jata hai.",
    ],
  },
  "owners.transfers": {
    title: "Owner transfers",
    what: "Partners ke darmiyan ya business mein aaya hua paisa.",
    steps: [
      "Chunein paisa kis ne diya aur kis ko mila.",
      "Amount likh kar save karein.",
    ],
    why: "Transfer record karna balance sahi rakhta hai aur profit ko cherta nahi.",
  },
  "expenses.page": {
    title: "Expenses",
    what: "Orders se aane wali tamam cost — item cost, commission, shipment — aur aap ke apne kharche.",
    steps: [
      "Period select karein.",
      "Jo kharch system ko maloom nahi, us ke liye Add Expense dabayein.",
      "Amount, date aur tafseel likh kar save karein.",
    ],
    why: "Yeh cost revenue se minus ho kar dashboard ka net profit banati hai.",
  },
  "returns.page": {
    title: "Returns",
    what: "Woh orders jin ka maal warehouse wapas aa gaya.",
    steps: [
      "List mein order dhoondein.",
      "Return mark karein — stock wapas add hoga aur sale revenue se nikal jayegi.",
    ],
  },
  "refunds.page": {
    title: "Refunds",
    what: "Woh orders jin mein paisa wapas hua magar maal customer ke paas raha.",
    steps: [
      "Jis order ka refund kiya, use dhoondein.",
      "Refund record karein — revenue wapas hoti hai, stock sold hi rehta hai.",
    ],
    why: "Refund aur return ko alag rakhna stock ko galat hone se bachata hai.",
  },
  "profit.page": {
    title: "Profit analysis",
    what: "Revenue mein se item cost, commission, shipping aur expenses — har order par.",
    steps: [
      "Period aur shop chunein.",
      "Profit column dekhein aur kam kamane wale orders pehchanein.",
    ],
  },
  "reports.page": {
    title: "Reports",
    what: "System mein mojood figures se report banayein.",
    steps: [
      "Period aur filters chunein.",
      "Screen par totals check karein.",
      "Print ya Save dabayein taake copy reh jaye.",
    ],
  },
  "credentials.page": {
    title: "Shop credentials",
    what: "Har shop ke login accounts.",
    steps: [
      "Nayi shop aane par Add Account dabayein.",
      "Us shop ka username aur password set karein.",
      "Password sirf zaroorat par reveal karein.",
    ],
    why: "In details se login kar ke har shop sirf apna stock aur sales dekhti hai.",
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
