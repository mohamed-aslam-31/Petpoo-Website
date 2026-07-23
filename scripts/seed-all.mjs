/**
 * Full seed: brands → categories → products → customers → suppliers →
 * employees → expenses → quotations → orders → invoices → purchases →
 * payments → credit_notes → stock_movements
 *
 * Run: node scripts/seed-all.mjs
 */
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── helpers ───────────────────────────────────────────────────────────────

function fmt(n) { return Number(n.toFixed(2)); }

// ─── reference data (brands / categories / products) ───────────────────────

const brands = [
  "Amul", "Britannia", "Parle", "Haldiram's",
  "ITC", "Nestle", "Hindustan Unilever", "Dabur",
];

const categoriesByBrand = {
  "Amul":               ["Dairy & Milk Products", "Frozen Foods"],
  "Britannia":          ["Biscuits & Cookies",    "Breads & Bakery"],
  "Parle":              ["Biscuits & Cookies",    "Snacks & Namkeen"],
  "Haldiram's":         ["Snacks & Namkeen",      "Sweets & Mithai"],
  "ITC":                ["Cigarettes & Tobacco",  "Biscuits & Cookies"],
  "Nestle":             ["Chocolates & Candies",  "Noodles & Pasta"],
  "Hindustan Unilever": ["Personal Care",         "Home Care"],
  "Dabur":              ["Health & Wellness",     "Juices & Beverages"],
};

const products = [
  { name:"Amul Full Cream Milk 1L",              sku:"AMU-MIL-001", barcode:"8901030001001", hsnCode:"04011000", brand:"Amul",               category:"Dairy & Milk Products",    purchasePrice:58,  sellingPrice:66,  wholesalePrice:62,  retailPrice:66,  gstPercent:0,  unit:"pcs", currentStock:120, minStock:30  },
  { name:"Amul Butter 500g",                     sku:"AMU-BUT-002", barcode:"8901030002001", hsnCode:"04051000", brand:"Amul",               category:"Dairy & Milk Products",    purchasePrice:225, sellingPrice:260, wholesalePrice:240, retailPrice:260, gstPercent:12, unit:"pcs", currentStock:80,  minStock:20  },
  { name:"Amul Cheese Slices 200g",              sku:"AMU-CHE-003", barcode:"8901030003001", hsnCode:"04061000", brand:"Amul",               category:"Dairy & Milk Products",    purchasePrice:95,  sellingPrice:115, wholesalePrice:105, retailPrice:115, gstPercent:12, unit:"pcs", currentStock:60,  minStock:15  },
  { name:"Amul Pizza Margherita 200g",           sku:"AMU-PIZ-004", barcode:"8901030004001", hsnCode:"19059000", brand:"Amul",               category:"Frozen Foods",             purchasePrice:85,  sellingPrice:105, wholesalePrice:94,  retailPrice:105, gstPercent:18, unit:"pcs", currentStock:40,  minStock:10  },
  { name:"Britannia Good Day Butter 200g",       sku:"BRI-GDB-001", barcode:"8901063001001", hsnCode:"19053100", brand:"Britannia",          category:"Biscuits & Cookies",       purchasePrice:28,  sellingPrice:35,  wholesalePrice:31,  retailPrice:35,  gstPercent:18, unit:"pcs", currentStock:200, minStock:50  },
  { name:"Britannia NutriChoice Digestive 400g", sku:"BRI-NCD-002", barcode:"8901063002001", hsnCode:"19053100", brand:"Britannia",          category:"Biscuits & Cookies",       purchasePrice:58,  sellingPrice:72,  wholesalePrice:64,  retailPrice:72,  gstPercent:18, unit:"pcs", currentStock:150, minStock:40  },
  { name:"Britannia Whole Wheat Bread 400g",     sku:"BRI-WWB-003", barcode:"8901063003001", hsnCode:"19051000", brand:"Britannia",          category:"Breads & Bakery",          purchasePrice:40,  sellingPrice:50,  wholesalePrice:44,  retailPrice:50,  gstPercent:0,  unit:"pcs", currentStock:90,  minStock:25  },
  { name:"Parle-G Original Gluco Biscuits 800g", sku:"PAR-GLU-001", barcode:"8901719001001", hsnCode:"19053100", brand:"Parle",              category:"Biscuits & Cookies",       purchasePrice:42,  sellingPrice:50,  wholesalePrice:46,  retailPrice:50,  gstPercent:18, unit:"pcs", currentStock:300, minStock:60  },
  { name:"Parle Hide & Seek Chocolate 100g",     sku:"PAR-HAS-002", barcode:"8901719002001", hsnCode:"19053100", brand:"Parle",              category:"Biscuits & Cookies",       purchasePrice:20,  sellingPrice:25,  wholesalePrice:22,  retailPrice:25,  gstPercent:18, unit:"pcs", currentStock:180, minStock:40  },
  { name:"Parle Wafers Classic Salt 50g",        sku:"PAR-WAF-003", barcode:"8901719003001", hsnCode:"20052000", brand:"Parle",              category:"Snacks & Namkeen",         purchasePrice:15,  sellingPrice:20,  wholesalePrice:17,  retailPrice:20,  gstPercent:18, unit:"pcs", currentStock:250, minStock:60  },
  { name:"Haldiram's Aloo Bhujia 400g",          sku:"HAL-ABH-001", barcode:"8906016001001", hsnCode:"20052000", brand:"Haldiram's",         category:"Snacks & Namkeen",         purchasePrice:80,  sellingPrice:100, wholesalePrice:88,  retailPrice:100, gstPercent:12, unit:"pcs", currentStock:130, minStock:30  },
  { name:"Haldiram's Khatta Meetha 400g",        sku:"HAL-KHM-002", barcode:"8906016002001", hsnCode:"20052000", brand:"Haldiram's",         category:"Snacks & Namkeen",         purchasePrice:78,  sellingPrice:98,  wholesalePrice:86,  retailPrice:98,  gstPercent:12, unit:"pcs", currentStock:110, minStock:25  },
  { name:"Haldiram's Soan Papdi 250g",           sku:"HAL-SOP-003", barcode:"8906016003001", hsnCode:"17049000", brand:"Haldiram's",         category:"Sweets & Mithai",          purchasePrice:75,  sellingPrice:95,  wholesalePrice:83,  retailPrice:95,  gstPercent:18, unit:"pcs", currentStock:70,  minStock:15  },
  { name:"ITC Sunfeast Dark Fantasy Choco Fills 300g", sku:"ITC-SDF-001", barcode:"8901137001001", hsnCode:"19053100", brand:"ITC",          category:"Biscuits & Cookies",       purchasePrice:80,  sellingPrice:100, wholesalePrice:88,  retailPrice:100, gstPercent:18, unit:"pcs", currentStock:160, minStock:35  },
  { name:"ITC Sunfeast Marie Light 250g",        sku:"ITC-SML-002", barcode:"8901137002001", hsnCode:"19053100", brand:"ITC",               category:"Biscuits & Cookies",       purchasePrice:22,  sellingPrice:28,  wholesalePrice:24,  retailPrice:28,  gstPercent:18, unit:"pcs", currentStock:220, minStock:50  },
  { name:"ITC Classic Regular 10s",              sku:"ITC-CLS-003", barcode:"8901137003001", hsnCode:"24022090", brand:"ITC",               category:"Cigarettes & Tobacco",     purchasePrice:110, sellingPrice:130, wholesalePrice:118, retailPrice:130, gstPercent:28, unit:"pkt", currentStock:80,  minStock:20  },
  { name:"Nestle KitKat 4 Finger 41.5g",         sku:"NES-KKT-001", barcode:"8901058001001", hsnCode:"18063200", brand:"Nestle",            category:"Chocolates & Candies",     purchasePrice:30,  sellingPrice:40,  wholesalePrice:34,  retailPrice:40,  gstPercent:18, unit:"pcs", currentStock:300, minStock:60  },
  { name:"Nestle Munch 35g",                     sku:"NES-MUN-002", barcode:"8901058002001", hsnCode:"18063200", brand:"Nestle",            category:"Chocolates & Candies",     purchasePrice:14,  sellingPrice:20,  wholesalePrice:16,  retailPrice:20,  gstPercent:18, unit:"pcs", currentStock:400, minStock:80  },
  { name:"Nestle Milkybar 30g",                  sku:"NES-MBR-003", barcode:"8901058003001", hsnCode:"18063200", brand:"Nestle",            category:"Chocolates & Candies",     purchasePrice:18,  sellingPrice:25,  wholesalePrice:21,  retailPrice:25,  gstPercent:18, unit:"pcs", currentStock:350, minStock:70  },
  { name:"Nestle Maggi 2-Minute Masala Noodles 70g", sku:"NES-MAG-004", barcode:"8901058004001", hsnCode:"19023000", brand:"Nestle",        category:"Noodles & Pasta",          purchasePrice:12,  sellingPrice:15,  wholesalePrice:13,  retailPrice:15,  gstPercent:18, unit:"pcs", currentStock:500, minStock:100 },
  { name:"Nestle Maggi Atta Noodles 80g",        sku:"NES-MAN-005", barcode:"8901058005001", hsnCode:"19023000", brand:"Nestle",            category:"Noodles & Pasta",          purchasePrice:14,  sellingPrice:18,  wholesalePrice:16,  retailPrice:18,  gstPercent:18, unit:"pcs", currentStock:350, minStock:80  },
  { name:"Dove Body Wash Deeply Nourishing 500ml", sku:"HUL-DBW-001", barcode:"8901030101001", hsnCode:"33041000", brand:"Hindustan Unilever", category:"Personal Care",         purchasePrice:190, sellingPrice:235, wholesalePrice:210, retailPrice:235, gstPercent:18, unit:"pcs", currentStock:75,  minStock:20  },
  { name:"Dove Soap Beauty Cream Bar 100g",      sku:"HUL-DSB-002", barcode:"8901030102001", hsnCode:"34011100", brand:"Hindustan Unilever", category:"Personal Care",          purchasePrice:42,  sellingPrice:55,  wholesalePrice:48,  retailPrice:55,  gstPercent:18, unit:"pcs", currentStock:200, minStock:50  },
  { name:"Surf Excel Easy Wash 1kg",             sku:"HUL-SEW-003", barcode:"8901030103001", hsnCode:"34022000", brand:"Hindustan Unilever", category:"Home Care",              purchasePrice:85,  sellingPrice:108, wholesalePrice:95,  retailPrice:108, gstPercent:18, unit:"pcs", currentStock:130, minStock:30  },
  { name:"Vim Dish Wash Gel 750ml",              sku:"HUL-VIM-004", barcode:"8901030104001", hsnCode:"34022000", brand:"Hindustan Unilever", category:"Home Care",              purchasePrice:88,  sellingPrice:110, wholesalePrice:97,  retailPrice:110, gstPercent:18, unit:"pcs", currentStock:100, minStock:25  },
  { name:"Dabur Chyawanprash 1kg",               sku:"DAB-CHY-001", barcode:"8901030201001", hsnCode:"21069099", brand:"Dabur",             category:"Health & Wellness",        purchasePrice:220, sellingPrice:280, wholesalePrice:248, retailPrice:280, gstPercent:12, unit:"pcs", currentStock:60,  minStock:15  },
  { name:"Dabur Honey 500g",                     sku:"DAB-HON-002", barcode:"8901030202001", hsnCode:"04090000", brand:"Dabur",             category:"Health & Wellness",        purchasePrice:165, sellingPrice:210, wholesalePrice:185, retailPrice:210, gstPercent:0,  unit:"pcs", currentStock:90,  minStock:20  },
  { name:"Dabur Lal Dant Manjan 100g",           sku:"DAB-LDM-003", barcode:"8901030203001", hsnCode:"33061000", brand:"Dabur",             category:"Health & Wellness",        purchasePrice:30,  sellingPrice:40,  wholesalePrice:34,  retailPrice:40,  gstPercent:18, unit:"pcs", currentStock:120, minStock:30  },
  { name:"Dabur Real Mango Juice 1L",            sku:"DAB-RMJ-004", barcode:"8901030204001", hsnCode:"20099000", brand:"Dabur",             category:"Juices & Beverages",       purchasePrice:72,  sellingPrice:90,  wholesalePrice:80,  retailPrice:90,  gstPercent:12, unit:"pcs", currentStock:140, minStock:35  },
  { name:"Dabur Real Mixed Fruit Juice 1L",      sku:"DAB-RMF-005", barcode:"8901030205001", hsnCode:"20099000", brand:"Dabur",             category:"Juices & Beverages",       purchasePrice:70,  sellingPrice:88,  wholesalePrice:78,  retailPrice:88,  gstPercent:12, unit:"pcs", currentStock:120, minStock:30  },
  { name:"Dabur Glucoplus-C Orange 500g",        sku:"DAB-GPC-006", barcode:"8901030206001", hsnCode:"21069099", brand:"Dabur",             category:"Juices & Beverages",       purchasePrice:95,  sellingPrice:120, wholesalePrice:106, retailPrice:120, gstPercent:18, unit:"pcs", currentStock:80,  minStock:20  },
];

// ─── seed data definitions ──────────────────────────────────────────────────

const customersData = [
  { code:"CUST-001", name:"Ravi Kumar",       phone:"9876543210", email:"ravi@example.com",    address:"12 MG Road",         city:"Mumbai",    state:"Maharashtra", shopName:"Ravi General Store",     gstNumber:"27AABCR1234A1Z5", creditLimit:50000,  type:"wholesale" },
  { code:"CUST-002", name:"Sunita Sharma",    phone:"9823456780", email:"sunita@example.com",  address:"45 Nehru Nagar",     city:"Delhi",     state:"Delhi",       shopName:"Sunita Kirana",           gstNumber:"07AABCS5678B2Z6", creditLimit:30000,  type:"retail"    },
  { code:"CUST-003", name:"Mohan Das",        phone:"9765432109", email:"mohan@example.com",   address:"78 Gandhi Street",   city:"Chennai",   state:"Tamil Nadu",  shopName:"Das Provision Store",    gstNumber:"33AABCM2345C3Z7", creditLimit:0,      type:"retail"    },
  { code:"CUST-004", name:"Priya Patel",      phone:"9712345678", email:"priya@example.com",   address:"23 Sardar Patel Rd", city:"Ahmedabad", state:"Gujarat",     shopName:"Priya Supermart",        gstNumber:"24AABCP8901D4Z8", creditLimit:100000, type:"wholesale" },
  { code:"CUST-005", name:"Anil Mehta",       phone:"9634567890", email:"anil@example.com",    address:"56 Ring Road",       city:"Kolkata",   state:"West Bengal", shopName:"Mehta Traders",          gstNumber:"19AABCA3456E5Z9", creditLimit:75000,  type:"wholesale" },
  { code:"CUST-006", name:"Kavitha Reddy",    phone:"9587654321", email:"kavitha@example.com", address:"89 Banjara Hills",   city:"Hyderabad", state:"Telangana",   shopName:"Kavitha Daily Needs",    gstNumber:"36AABCK6789F6Z0", creditLimit:0,      type:"retail"    },
  { code:"CUST-007", name:"Suresh Gupta",     phone:"9543210987", email:"suresh@example.com",  address:"34 Civil Lines",     city:"Pune",      state:"Maharashtra", shopName:"Gupta & Sons",           gstNumber:"27AABCG4567G7Z1", creditLimit:60000,  type:"wholesale" },
  { code:"CUST-008", name:"Meena Joshi",      phone:"9498765432", email:"meena@example.com",   address:"67 Lal Bagh Road",   city:"Bangalore", state:"Karnataka",   shopName:"Meena Provisions",       gstNumber:"29AABCM7890H8Z2", creditLimit:25000,  type:"retail"    },
  { code:"CUST-009", name:"Rajesh Verma",     phone:"9456789012", email:"rajesh@example.com",  address:"90 Station Road",    city:"Jaipur",    state:"Rajasthan",   shopName:"Verma Wholesale",        gstNumber:"08AABCR9012I9Z3", creditLimit:200000, type:"wholesale" },
  { code:"CUST-010", name:"Deepa Nair",       phone:"9412345670", email:"deepa@example.com",   address:"11 Convent Road",    city:"Kochi",     state:"Kerala",      shopName:"Deepa Mini Market",     gstNumber:"32AABCD1234J0Z4", creditLimit:0,      type:"retail"    },
];

const suppliersData = [
  { code:"SUPP-001", name:"Gujarat Dairy Distributors", phone:"9800012345", email:"info@gujaratdairy.com",   address:"Plot 12, GIDC, Anand",         gstNumber:"24AABCG1111A1Z1" },
  { code:"SUPP-002", name:"Britannia Sales Corp",        phone:"9800023456", email:"sales@britanniasales.in", address:"42 Industrial Area, Kolkata",   gstNumber:"19AABCB2222B2Z2" },
  { code:"SUPP-003", name:"Parle Products Pvt Ltd",      phone:"9800034567", email:"trade@parle.in",          address:"Parle House, Vile Parle, Mumbai",gstNumber:"27AABCP3333C3Z3" },
  { code:"SUPP-004", name:"Haldiram Snacks Ltd",         phone:"9800045678", email:"supply@haldiram.com",     address:"Haldiram Complex, Nagpur",      gstNumber:"27AABCH4444D4Z4" },
  { code:"SUPP-005", name:"ITC Foods Division",          phone:"9800056789", email:"itcfoods@itc.in",         address:"ITC Centre, Kolkata",           gstNumber:"19AABCI5555E5Z5" },
  { code:"SUPP-006", name:"Nestle India Ltd",            phone:"9800067890", email:"trade@nestle.in",         address:"Nestle House, Gurgaon",         gstNumber:"06AABCN6666F6Z6" },
  { code:"SUPP-007", name:"HUL Distributors",            phone:"9800078901", email:"huldist@hul.com",         address:"Hindustan House, Mumbai",       gstNumber:"27AABCH7777G7Z7" },
  { code:"SUPP-008", name:"Dabur India Ltd",             phone:"9800089012", email:"supply@dabur.com",        address:"Kaushambi, Ghaziabad",          gstNumber:"09AABCD8888H8Z8" },
  { code:"SUPP-009", name:"Metro Cash & Carry",          phone:"9800090123", email:"b2b@metro.in",            address:"Metro Centre, Hyderabad",       gstNumber:"36AABCM9999I9Z9" },
  { code:"SUPP-010", name:"Reliance Retail Supply",      phone:"9800001234", email:"supply@relianceret.com",  address:"Reliance Corp Park, Navi Mumbai",gstNumber:"27AABCR0000J0Z0" },
];

const employeesData = [
  { code:"EMP-001", name:"Amit Singh",     phone:"9100001111", email:"amit.singh@shopflow.com",     address:"Block A, Staff Quarters", role:"manager",      department:"Operations",  salary:55000, joiningDate:"2024-01-15" },
  { code:"EMP-002", name:"Pooja Rao",      phone:"9100002222", email:"pooja.rao@shopflow.com",      address:"Block B, Staff Quarters", role:"sales_staff",  department:"Sales",       salary:28000, joiningDate:"2024-02-01" },
  { code:"EMP-003", name:"Vikram Jain",    phone:"9100003333", email:"vikram.jain@shopflow.com",    address:"Block C, Staff Quarters", role:"sales_staff",  department:"Sales",       salary:26000, joiningDate:"2024-03-10" },
  { code:"EMP-004", name:"Ananya Pillai",  phone:"9100004444", email:"ananya.pillai@shopflow.com",  address:"Block A, Staff Quarters", role:"accountant",   department:"Finance",     salary:40000, joiningDate:"2024-01-20" },
  { code:"EMP-005", name:"Kiran Yadav",    phone:"9100005555", email:"kiran.yadav@shopflow.com",    address:"Block D, Staff Quarters", role:"delivery_boy", department:"Logistics",   salary:18000, joiningDate:"2024-04-05" },
  { code:"EMP-006", name:"Sanjay Tiwari",  phone:"9100006666", email:"sanjay.tiwari@shopflow.com",  address:"Block B, Staff Quarters", role:"sales_staff",  department:"Sales",       salary:27000, joiningDate:"2024-03-15" },
  { code:"EMP-007", name:"Rekha Desai",    phone:"9100007777", email:"rekha.desai@shopflow.com",    address:"Block C, Staff Quarters", role:"manager",      department:"Purchasing",  salary:52000, joiningDate:"2024-01-10" },
  { code:"EMP-008", name:"Tarun Malhotra", phone:"9100008888", email:"tarun.malhotra@shopflow.com", address:"Block A, Staff Quarters", role:"delivery_boy", department:"Logistics",   salary:17000, joiningDate:"2024-05-01" },
  { code:"EMP-009", name:"Priti Kulkarni", phone:"9100009999", email:"priti.kulkarni@shopflow.com", address:"Block D, Staff Quarters", role:"accountant",   department:"Finance",     salary:38000, joiningDate:"2024-02-20" },
  { code:"EMP-010", name:"Deepak Mishra",  phone:"9100000000", email:"deepak.mishra@shopflow.com",  address:"Block B, Staff Quarters", role:"sales_staff",  department:"Sales",       salary:25000, joiningDate:"2024-06-01" },
];

const expensesData = [
  { title:"Warehouse Rent – June 2026",        amount:45000, category:"rent",          date:"2026-06-01", status:"paid",    paidBy:"Amit Singh",     description:"Monthly warehouse rent for June 2026" },
  { title:"Electricity Bill – May 2026",        amount:12500, category:"utilities",     date:"2026-05-31", status:"paid",    paidBy:"Ananya Pillai",  description:"MSEDCL electricity bill for May 2026" },
  { title:"Delivery Vehicle Fuel – June 2026",  amount:8200,  category:"transport",     date:"2026-06-15", status:"paid",    paidBy:"Kiran Yadav",    description:"Petrol refill for two delivery bikes" },
  { title:"Staff Salaries – June 2026",         amount:266000,category:"salary",        date:"2026-06-30", status:"paid",    paidBy:"Ananya Pillai",  description:"June 2026 payroll for all staff" },
  { title:"Office Supplies & Stationery",       amount:3400,  category:"miscellaneous", date:"2026-06-10", status:"paid",    paidBy:"Rekha Desai",    description:"Printer paper, pens, files, stamps" },
  { title:"Internet & Telephone – June 2026",   amount:2800,  category:"utilities",     date:"2026-06-05", status:"paid",    paidBy:"Amit Singh",     description:"Broadband + mobile bills" },
  { title:"Warehouse Maintenance & Repairs",    amount:15000, category:"maintenance",   date:"2026-06-20", status:"paid",    paidBy:"Amit Singh",     description:"Shelving repairs and pest control" },
  { title:"Vehicle Insurance Renewal",          amount:22000, category:"insurance",     date:"2026-06-12", status:"paid",    paidBy:"Rekha Desai",    description:"Annual commercial vehicle insurance" },
  { title:"Security Guard Charges – June 2026", amount:9500,  category:"miscellaneous", date:"2026-06-30", status:"paid",    paidBy:"Amit Singh",     description:"Monthly security service fee" },
  { title:"GST Filing Professional Fees",       amount:5000,  category:"professional",  date:"2026-07-05", status:"pending", paidBy:"Ananya Pillai",  description:"CA fees for June quarter GST return" },
];

async function seed() {
  const client = await pool.connect();
  try {

    // ── 1. Brands ────────────────────────────────────────────────────────
    console.log("🌱 Seeding brands...");
    const brandIdMap = {};
    for (const brand of brands) {
      const r = await client.query(
        `INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [brand]
      );
      brandIdMap[brand] = r.rows[0].id;
    }
    console.log(`   ✓ ${brands.length} brands`);

    // ── 2. Categories ────────────────────────────────────────────────────
    console.log("🌱 Seeding categories...");
    const categoryIdMap = {};
    for (const [brandName, cats] of Object.entries(categoriesByBrand)) {
      const brandId = brandIdMap[brandName];
      for (const cat of cats) {
        const key = `${brandName}::${cat}`;
        const ins = await client.query(
          `INSERT INTO categories (name, brand_id, brand_name) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING RETURNING id`,
          [cat, brandId, brandName]
        );
        if (ins.rows.length > 0) {
          categoryIdMap[key] = ins.rows[0].id;
        } else {
          const ex = await client.query(
            `SELECT id FROM categories WHERE name=$1 AND brand_id=$2 LIMIT 1`,
            [cat, brandId]
          );
          categoryIdMap[key] = ex.rows[0].id;
        }
      }
    }
    console.log(`   ✓ ${Object.values(categoriesByBrand).flat().length} categories`);

    // ── 3. Products ──────────────────────────────────────────────────────
    console.log("🌱 Seeding products...");
    const productIdMap = {}; // sku → { id, name, sku, gstPercent, sellingPrice, purchasePrice, unit, brandId, brandName, categoryId, categoryName, currentStock }
    for (const p of products) {
      const brandId    = brandIdMap[p.brand];
      const catKey     = `${p.brand}::${p.category}`;
      const categoryId = categoryIdMap[catKey];
      const r = await client.query(
        `INSERT INTO products
           (name,sku,barcode,hsn_code,category_id,brand_id,purchase_price,selling_price,
            wholesale_price,retail_price,gst_percent,unit,current_stock,min_stock,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active')
         ON CONFLICT (sku) DO UPDATE SET
           name=EXCLUDED.name, purchase_price=EXCLUDED.purchase_price,
           selling_price=EXCLUDED.selling_price, current_stock=EXCLUDED.current_stock
         RETURNING id`,
        [p.name,p.sku,p.barcode,p.hsnCode,categoryId,brandId,
         p.purchasePrice,p.sellingPrice,p.wholesalePrice,p.retailPrice,
         p.gstPercent,p.unit,p.currentStock,p.minStock]
      );
      productIdMap[p.sku] = {
        id: r.rows[0].id, name: p.name, sku: p.sku,
        gstPercent: p.gstPercent, sellingPrice: p.sellingPrice,
        purchasePrice: p.purchasePrice, unit: p.unit,
        brandId, brandName: p.brand, categoryId, categoryName: p.category,
        currentStock: p.currentStock,
      };
    }
    console.log(`   ✓ ${products.length} products`);

    // Handy shorthand list for building line items
    const pList = Object.values(productIdMap);
    const pick  = (i) => pList[i % pList.length];

    // ── 4. Customers ─────────────────────────────────────────────────────
    console.log("🌱 Seeding customers...");
    const customerIds = [];
    for (const c of customersData) {
      const r = await client.query(
        `INSERT INTO customers
           (customer_code,name,phone,email,address,city,state,shop_name,gst_number,
            credit_limit,outstanding,type,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,'active')
         ON CONFLICT (customer_code) DO UPDATE SET name=EXCLUDED.name
         RETURNING id`,
        [c.code,c.name,c.phone,c.email,c.address,c.city,c.state,c.shopName,
         c.gstNumber,c.creditLimit,c.type]
      );
      customerIds.push(r.rows[0].id);
    }
    console.log(`   ✓ ${customerIds.length} customers`);

    // ── 5. Suppliers ─────────────────────────────────────────────────────
    console.log("🌱 Seeding suppliers...");
    const supplierIds = [];
    for (const s of suppliersData) {
      const r = await client.query(
        `INSERT INTO suppliers
           (supplier_code,name,phone,email,address,gst_number,outstanding,status)
         VALUES ($1,$2,$3,$4,$5,$6,0,'active')
         ON CONFLICT (supplier_code) DO UPDATE SET name=EXCLUDED.name
         RETURNING id`,
        [s.code,s.name,s.phone,s.email,s.address,s.gstNumber]
      );
      supplierIds.push(r.rows[0].id);
    }
    console.log(`   ✓ ${supplierIds.length} suppliers`);

    // ── 6. Employees ─────────────────────────────────────────────────────
    console.log("🌱 Seeding employees...");
    for (const e of employeesData) {
      await client.query(
        `INSERT INTO employees
           (employee_code,name,phone,email,address,role,department,salary,status,joining_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
         ON CONFLICT (employee_code) DO UPDATE SET name=EXCLUDED.name`,
        [e.code,e.name,e.phone,e.email,e.address,e.role,e.department,e.salary,e.joiningDate]
      );
    }
    console.log(`   ✓ ${employeesData.length} employees`);

    // ── 7. Expenses ──────────────────────────────────────────────────────
    console.log("🌱 Seeding expenses...");
    for (const e of expensesData) {
      await client.query(
        `INSERT INTO expenses (title,amount,category,date,status,description,paid_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        [e.title,e.amount,e.category,e.date,e.status,e.description,e.paidBy]
      );
    }
    console.log(`   ✓ ${expensesData.length} expenses`);

    // ── 8. Quotations ────────────────────────────────────────────────────
    console.log("🌱 Seeding quotations...");
    const quotationIds   = [];
    const quotationNums  = [];
    for (let i = 0; i < 10; i++) {
      const customerId = customerIds[i];
      const p1 = pick(i * 3);
      const p2 = pick(i * 3 + 1);
      const qty1 = 5 + i;
      const qty2 = 3 + i;
      const disc = i % 3 === 0 ? 5 : 0; // 5% discount every third record

      const lt1 = fmt(qty1 * p1.sellingPrice * (1 - disc/100) * (1 + p1.gstPercent/100));
      const lt2 = fmt(qty2 * p2.sellingPrice * (1 - disc/100) * (1 + p2.gstPercent/100));
      const subtotal   = fmt(qty1 * p1.sellingPrice * (1 - disc/100) + qty2 * p2.sellingPrice * (1 - disc/100));
      const gstAmount  = fmt((lt1 + lt2) - subtotal);
      const transport  = i % 2 === 0 ? 200 : 0;
      const total      = fmt(lt1 + lt2 + transport);

      const qNum = `QUO-2026-${String(i + 1).padStart(3, "0")}`;
      const date = `2026-06-${String(10 + i).padStart(2, "0")}`;
      const status = i < 3 ? "draft" : i < 7 ? "sent" : "accepted";

      const items = [
        { productId:p1.id, productName:p1.name, quantity:qty1, unitPrice:p1.sellingPrice, discount:disc, gstPercent:p1.gstPercent, lineTotal:lt1 },
        { productId:p2.id, productName:p2.name, quantity:qty2, unitPrice:p2.sellingPrice, discount:disc, gstPercent:p2.gstPercent, lineTotal:lt2 },
      ];

      const r = await client.query(
        `INSERT INTO quotations
           (quotation_number,customer_id,type,date,transport,package_charge,other_charge,
            subtotal,gst_amount,total,items,status)
         VALUES ($1,$2,'gst',$3,$4,0,0,$5,$6,$7,$8,$9)
         ON CONFLICT (quotation_number) DO UPDATE SET status=EXCLUDED.status
         RETURNING id`,
        [qNum,customerId,date,transport,subtotal,gstAmount,total,
         JSON.stringify(items),status]
      );
      quotationIds.push(r.rows[0].id);
      quotationNums.push(qNum);
    }
    console.log(`   ✓ 10 quotations`);

    // ── 9. Orders ────────────────────────────────────────────────────────
    console.log("🌱 Seeding orders...");
    const orderIds  = [];
    const orderNums = [];
    const statuses  = ["pending","confirmed","processing","shipped","delivered","delivered","delivered","delivered","cancelled","pending"];
    for (let i = 0; i < 10; i++) {
      const customerId = customerIds[i];
      const p1 = pick(i * 2 + 1);
      const p2 = pick(i * 2 + 2);
      const qty1 = 10 + i;
      const qty2 = 6 + i;

      const oNum   = `ORD-2026-${String(i + 1).padStart(3, "0")}`;
      const oDate  = `2026-06-${String(15 + i).padStart(2, "0")}`;
      const status = statuses[i];

      // orders items only need productId, productName, sku, quantity
      const items = [
        { productId:p1.id, productName:p1.name, sku:p1.sku, quantity:qty1 },
        { productId:p2.id, productName:p2.name, sku:p2.sku, quantity:qty2 },
      ];

      const fromQuotation = i < 5;
      const r = await client.query(
        `INSERT INTO orders
           (order_number,customer_id,status,order_date,items,created_from,quotation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (order_number) DO UPDATE SET status=EXCLUDED.status
         RETURNING id`,
        [oNum,customerId,status,oDate,JSON.stringify(items),
         fromQuotation ? "quotation" : "direct",
         fromQuotation ? quotationIds[i] : null]
      );
      orderIds.push(r.rows[0].id);
      orderNums.push(oNum);
    }
    console.log(`   ✓ 10 orders`);

    // ── 10. Invoices ─────────────────────────────────────────────────────
    console.log("🌱 Seeding invoices...");
    const invoiceIds  = [];
    const invoiceNums = [];
    const invStatuses = ["paid","paid","partial","paid","unpaid","paid","partial","unpaid","paid","paid"];
    for (let i = 0; i < 10; i++) {
      const customerId = customerIds[i];
      const p1 = pick(i * 4);
      const p2 = pick(i * 4 + 1);
      const p3 = pick(i * 4 + 2);
      const qty1 = 8 + i, qty2 = 5 + i, qty3 = 3 + i;
      const disc = 0;

      const lineTotal1 = fmt(qty1 * p1.sellingPrice * (1 + p1.gstPercent/100));
      const lineTotal2 = fmt(qty2 * p2.sellingPrice * (1 + p2.gstPercent/100));
      const lineTotal3 = fmt(qty3 * p3.sellingPrice * (1 + p3.gstPercent/100));

      const subtotal  = fmt(qty1*p1.sellingPrice + qty2*p2.sellingPrice + qty3*p3.sellingPrice);
      const gstAmount = fmt((lineTotal1+lineTotal2+lineTotal3) - subtotal);
      const cgst      = fmt(gstAmount / 2);
      const sgst      = fmt(gstAmount / 2);
      const transport = i % 3 === 0 ? 150 : 0;
      const total     = fmt(lineTotal1+lineTotal2+lineTotal3+transport);
      const payStatus = invStatuses[i];
      const paid      = payStatus === "paid" ? total : payStatus === "partial" ? fmt(total * 0.5) : 0;

      const iNum = `INV-2026-${String(i + 1).padStart(3, "0")}`;
      const iDate = `2026-06-${String(18 + i).padStart(2, "0")}`;
      const dueDate = `2026-07-${String(18 + i).padStart(2, "0")}`;

      const items = [
        { productId:p1.id, productName:p1.name, sku:p1.sku, quantity:qty1, unitPrice:p1.sellingPrice, discount:disc, gstPercent:p1.gstPercent, total:lineTotal1 },
        { productId:p2.id, productName:p2.name, sku:p2.sku, quantity:qty2, unitPrice:p2.sellingPrice, discount:disc, gstPercent:p2.gstPercent, total:lineTotal2 },
        { productId:p3.id, productName:p3.name, sku:p3.sku, quantity:qty3, unitPrice:p3.sellingPrice, discount:disc, gstPercent:p3.gstPercent, total:lineTotal3 },
      ];

      const r = await client.query(
        `INSERT INTO invoices
           (invoice_number,customer_id,order_id,type,status,subtotal,discount,cgst,sgst,
            igst,gst_amount,transport,package_charge,other_charge,total,paid_amount,
            payment_status,due_date,items,created_from)
         VALUES ($1,$2,$3,'gst','paid',$4,0,$5,$6,0,$7,$8,0,0,$9,$10,$11,$12,$13,'order')
         ON CONFLICT (invoice_number) DO UPDATE SET status=EXCLUDED.status
         RETURNING id`,
        [iNum,customerId,orderIds[i],subtotal,cgst,sgst,gstAmount,transport,total,paid,payStatus,dueDate,JSON.stringify(items)]
      );
      invoiceIds.push(r.rows[0].id);
      invoiceNums.push(iNum);
    }
    console.log(`   ✓ 10 invoices`);

    // ── 11. Purchases ────────────────────────────────────────────────────
    console.log("🌱 Seeding purchases...");
    for (let i = 0; i < 10; i++) {
      const supplierId = supplierIds[i];
      const p1 = pick(i * 3 + 2);
      const p2 = pick(i * 3 + 3);
      const qty1 = 50 + i * 5, qty2 = 30 + i * 3;

      const lt1 = fmt(qty1 * p1.purchasePrice);
      const lt2 = fmt(qty2 * p2.purchasePrice);
      const ga1 = fmt(lt1 * p1.gstPercent / 100);
      const ga2 = fmt(lt2 * p2.gstPercent / 100);
      const subtotal   = fmt(lt1 + lt2);
      const gstTotal   = fmt(ga1 + ga2);
      const transport  = 300 + i * 50;
      const grandTotal = fmt(subtotal + gstTotal + transport);

      const pNum = `PUR-2026-${String(i + 1).padStart(3, "0")}`;
      const pDate = `2026-06-${String(5 + i).padStart(2, "0")}`;

      const items = [
        { productId:p1.id, productName:p1.name, sku:p1.sku, brandId:p1.brandId, brandName:p1.brandName, categoryId:p1.categoryId, categoryName:p1.categoryName, currentStock:p1.currentStock, quantity:qty1, unit:p1.unit, purchasePrice:p1.purchasePrice, gstPercent:p1.gstPercent, lineTotal:lt1, gstAmount:ga1 },
        { productId:p2.id, productName:p2.name, sku:p2.sku, brandId:p2.brandId, brandName:p2.brandName, categoryId:p2.categoryId, categoryName:p2.categoryName, currentStock:p2.currentStock, quantity:qty2, unit:p2.unit, purchasePrice:p2.purchasePrice, gstPercent:p2.gstPercent, lineTotal:lt2, gstAmount:ga2 },
      ];

      await client.query(
        `INSERT INTO purchases
           (purchase_number,supplier_id,purchase_date,items,transport_charges,
            subtotal,gst_total,grand_total,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (purchase_number) DO NOTHING`,
        [pNum,supplierId,pDate,JSON.stringify(items),transport,subtotal,gstTotal,grandTotal,
         `Purchase order from ${suppliersData[i].name}`]
      );
    }
    console.log(`   ✓ 10 purchases`);

    // ── 12. Payments ─────────────────────────────────────────────────────
    console.log("🌱 Seeding payments...");
    const methods  = ["cash","upi","bank_transfer","cheque","cash","upi","bank_transfer","cash","upi","cheque"];
    for (let i = 0; i < 10; i++) {
      const isCustomer = i < 7;
      const refNum = `PAY-2026-${String(i + 1).padStart(3, "0")}`;
      const amount = [12500,8900,45000,22000,6700,33000,19500,11000,54000,7800][i];
      await client.query(
        `INSERT INTO payments
           (reference_number,amount,method,type,entity_type,entity_id,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (reference_number) DO NOTHING`,
        [refNum,amount,methods[i],
         isCustomer ? "received" : "paid",
         isCustomer ? "customer"  : "supplier",
         isCustomer ? customerIds[i] : supplierIds[i - 7],
         isCustomer
           ? `Payment received against invoice ${invoiceNums[i] ?? "INV-2026-001"}`
           : `Payment to ${suppliersData[i - 7].name} for purchase PUR-2026-${String(i - 6).padStart(3,"0")}`
        ]
      );
    }
    console.log(`   ✓ 10 payments`);

    // ── 13. Credit Notes ─────────────────────────────────────────────────
    console.log("🌱 Seeding credit notes...");
    const cnTypes = ["return","damaged","wrong_amount","return","damaged","cancellation","return","wrong_amount","damaged","return"];
    for (let i = 0; i < 10; i++) {
      const p1 = pick(i + 5);
      const qty = 2 + (i % 3);
      const amount = fmt(qty * p1.sellingPrice * (1 + p1.gstPercent / 100));
      const cnNum  = `CN-2026-${String(i + 1).padStart(3, "0")}`;
      const items  = [
        { productId:p1.id, productName:p1.name, quantity:qty, rate:p1.sellingPrice, amount }
      ];
      await client.query(
        `INSERT INTO credit_notes
           (credit_note_number,invoice_id,invoice_number,customer_id,type,amount,reason,items,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (credit_note_number) DO NOTHING`,
        [cnNum, invoiceIds[i % invoiceIds.length], invoiceNums[i % invoiceNums.length],
         customerIds[i % customerIds.length], cnTypes[i], amount,
         `${cnTypes[i].replace(/_/g," ")} – ${p1.name}`,
         JSON.stringify(items),
         i < 4 ? "approved" : i < 7 ? "pending" : "rejected"]
      );
    }
    console.log(`   ✓ 10 credit notes`);

    // ── 14. Stock Movements ──────────────────────────────────────────────
    console.log("🌱 Seeding stock movements...");
    const smTypes  = ["sale","purchase","adjustment","sale","purchase","damage","sale","adjustment","purchase","sale"];
    const smReason = ["Sold via invoice","Received from supplier","Manual count correction","Sold via invoice","Received from purchase order","Damaged goods write-off","Sold via order","Periodic audit adjustment","Restocking","Sold via invoice"];
    for (let i = 0; i < 10; i++) {
      const p = pick(i * 2);
      const before = p.currentStock;
      const qty    = [10,50,5,8,30,3,12,7,40,15][i];
      const isIn   = ["purchase","adjustment"].includes(smTypes[i]) || smTypes[i] === "purchase";
      const after  = smTypes[i] === "sale" || smTypes[i] === "damage"
                     ? Math.max(0, before - qty) : before + qty;
      await client.query(
        `INSERT INTO stock_movements
           (product_id,type,quantity,before_stock,after_stock,reason,notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [p.id, smTypes[i], qty, before, after, smReason[i],
         `Auto-generated by seed`, "System"]
      );
    }
    console.log(`   ✓ 10 stock movements`);

    // ── Summary ──────────────────────────────────────────────────────────
    console.log(`
✅ Full seed complete!
   Brands:          ${brands.length}
   Categories:      ${Object.values(categoriesByBrand).flat().length}
   Products:        ${products.length}
   Customers:       10
   Suppliers:       10
   Employees:       10
   Expenses:        10
   Quotations:      10
   Orders:          10
   Invoices:        10
   Purchases:       10
   Payments:        10
   Credit Notes:    10
   Stock Movements: 10
`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error("❌", err.message, err); process.exit(1); });
