import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const brands = [
  "Amul",
  "Britannia",
  "Parle",
  "Haldiram's",
  "ITC",
  "Nestle",
  "Hindustan Unilever",
  "Dabur",
];

const categoriesByBrand = {
  "Amul": ["Dairy & Milk Products", "Frozen Foods"],
  "Britannia": ["Biscuits & Cookies", "Breads & Bakery"],
  "Parle": ["Biscuits & Cookies", "Snacks & Namkeen"],
  "Haldiram's": ["Snacks & Namkeen", "Sweets & Mithai"],
  "ITC": ["Cigarettes & Tobacco", "Biscuits & Cookies"],
  "Nestle": ["Chocolates & Candies", "Noodles & Pasta"],
  "Hindustan Unilever": ["Personal Care", "Home Care"],
  "Dabur": ["Health & Wellness", "Juices & Beverages"],
};

const products = [
  // Amul – Dairy & Milk Products
  { name: "Amul Full Cream Milk 1L", sku: "AMU-MIL-001", barcode: "8901030001001", hsnCode: "04011000", brand: "Amul", category: "Dairy & Milk Products", purchasePrice: 58, sellingPrice: 66, wholesalePrice: 62, retailPrice: 66, gstPercent: 0, unit: "pcs", currentStock: 120, minStock: 30 },
  { name: "Amul Butter 500g", sku: "AMU-BUT-002", barcode: "8901030002001", hsnCode: "04051000", brand: "Amul", category: "Dairy & Milk Products", purchasePrice: 225, sellingPrice: 260, wholesalePrice: 240, retailPrice: 260, gstPercent: 12, unit: "pcs", currentStock: 80, minStock: 20 },
  { name: "Amul Cheese Slices 200g", sku: "AMU-CHE-003", barcode: "8901030003001", hsnCode: "04061000", brand: "Amul", category: "Dairy & Milk Products", purchasePrice: 95, sellingPrice: 115, wholesalePrice: 105, retailPrice: 115, gstPercent: 12, unit: "pcs", currentStock: 60, minStock: 15 },
  // Amul – Frozen Foods
  { name: "Amul Pizza Margherita 200g", sku: "AMU-PIZ-004", barcode: "8901030004001", hsnCode: "19059000", brand: "Amul", category: "Frozen Foods", purchasePrice: 85, sellingPrice: 105, wholesalePrice: 94, retailPrice: 105, gstPercent: 18, unit: "pcs", currentStock: 40, minStock: 10 },
  // Britannia – Biscuits & Cookies
  { name: "Britannia Good Day Butter 200g", sku: "BRI-GDB-001", barcode: "8901063001001", hsnCode: "19053100", brand: "Britannia", category: "Biscuits & Cookies", purchasePrice: 28, sellingPrice: 35, wholesalePrice: 31, retailPrice: 35, gstPercent: 18, unit: "pcs", currentStock: 200, minStock: 50 },
  { name: "Britannia NutriChoice Digestive 400g", sku: "BRI-NCD-002", barcode: "8901063002001", hsnCode: "19053100", brand: "Britannia", category: "Biscuits & Cookies", purchasePrice: 58, sellingPrice: 72, wholesalePrice: 64, retailPrice: 72, gstPercent: 18, unit: "pcs", currentStock: 150, minStock: 40 },
  // Britannia – Breads & Bakery
  { name: "Britannia Whole Wheat Bread 400g", sku: "BRI-WWB-003", barcode: "8901063003001", hsnCode: "19051000", brand: "Britannia", category: "Breads & Bakery", purchasePrice: 40, sellingPrice: 50, wholesalePrice: 44, retailPrice: 50, gstPercent: 0, unit: "pcs", currentStock: 90, minStock: 25 },
  // Parle – Biscuits & Cookies
  { name: "Parle-G Original Gluco Biscuits 800g", sku: "PAR-GLU-001", barcode: "8901719001001", hsnCode: "19053100", brand: "Parle", category: "Biscuits & Cookies", purchasePrice: 42, sellingPrice: 50, wholesalePrice: 46, retailPrice: 50, gstPercent: 18, unit: "pcs", currentStock: 300, minStock: 60 },
  { name: "Parle Hide & Seek Chocolate 100g", sku: "PAR-HAS-002", barcode: "8901719002001", hsnCode: "19053100", brand: "Parle", category: "Biscuits & Cookies", purchasePrice: 20, sellingPrice: 25, wholesalePrice: 22, retailPrice: 25, gstPercent: 18, unit: "pcs", currentStock: 180, minStock: 40 },
  // Parle – Snacks & Namkeen
  { name: "Parle Wafers Classic Salt 50g", sku: "PAR-WAF-003", barcode: "8901719003001", hsnCode: "20052000", brand: "Parle", category: "Snacks & Namkeen", purchasePrice: 15, sellingPrice: 20, wholesalePrice: 17, retailPrice: 20, gstPercent: 18, unit: "pcs", currentStock: 250, minStock: 60 },
  // Haldiram's – Snacks & Namkeen
  { name: "Haldiram's Aloo Bhujia 400g", sku: "HAL-ABH-001", barcode: "8906016001001", hsnCode: "20052000", brand: "Haldiram's", category: "Snacks & Namkeen", purchasePrice: 80, sellingPrice: 100, wholesalePrice: 88, retailPrice: 100, gstPercent: 12, unit: "pcs", currentStock: 130, minStock: 30 },
  { name: "Haldiram's Khatta Meetha 400g", sku: "HAL-KHM-002", barcode: "8906016002001", hsnCode: "20052000", brand: "Haldiram's", category: "Snacks & Namkeen", purchasePrice: 78, sellingPrice: 98, wholesalePrice: 86, retailPrice: 98, gstPercent: 12, unit: "pcs", currentStock: 110, minStock: 25 },
  // Haldiram's – Sweets & Mithai
  { name: "Haldiram's Soan Papdi 250g", sku: "HAL-SOP-003", barcode: "8906016003001", hsnCode: "17049000", brand: "Haldiram's", category: "Sweets & Mithai", purchasePrice: 75, sellingPrice: 95, wholesalePrice: 83, retailPrice: 95, gstPercent: 18, unit: "pcs", currentStock: 70, minStock: 15 },
  // ITC – Biscuits & Cookies
  { name: "ITC Sunfeast Dark Fantasy Choco Fills 300g", sku: "ITC-SDF-001", barcode: "8901137001001", hsnCode: "19053100", brand: "ITC", category: "Biscuits & Cookies", purchasePrice: 80, sellingPrice: 100, wholesalePrice: 88, retailPrice: 100, gstPercent: 18, unit: "pcs", currentStock: 160, minStock: 35 },
  { name: "ITC Sunfeast Marie Light 250g", sku: "ITC-SML-002", barcode: "8901137002001", hsnCode: "19053100", brand: "ITC", category: "Biscuits & Cookies", purchasePrice: 22, sellingPrice: 28, wholesalePrice: 24, retailPrice: 28, gstPercent: 18, unit: "pcs", currentStock: 220, minStock: 50 },
  // ITC – Cigarettes & Tobacco
  { name: "ITC Classic Regular 10s", sku: "ITC-CLS-003", barcode: "8901137003001", hsnCode: "24022090", brand: "ITC", category: "Cigarettes & Tobacco", purchasePrice: 110, sellingPrice: 130, wholesalePrice: 118, retailPrice: 130, gstPercent: 28, unit: "pkt", currentStock: 80, minStock: 20 },
  // Nestle – Chocolates & Candies
  { name: "Nestle KitKat 4 Finger 41.5g", sku: "NES-KKT-001", barcode: "8901058001001", hsnCode: "18063200", brand: "Nestle", category: "Chocolates & Candies", purchasePrice: 30, sellingPrice: 40, wholesalePrice: 34, retailPrice: 40, gstPercent: 18, unit: "pcs", currentStock: 300, minStock: 60 },
  { name: "Nestle Munch 35g", sku: "NES-MUN-002", barcode: "8901058002001", hsnCode: "18063200", brand: "Nestle", category: "Chocolates & Candies", purchasePrice: 14, sellingPrice: 20, wholesalePrice: 16, retailPrice: 20, gstPercent: 18, unit: "pcs", currentStock: 400, minStock: 80 },
  { name: "Nestle Milkybar 30g", sku: "NES-MBR-003", barcode: "8901058003001", hsnCode: "18063200", brand: "Nestle", category: "Chocolates & Candies", purchasePrice: 18, sellingPrice: 25, wholesalePrice: 21, retailPrice: 25, gstPercent: 18, unit: "pcs", currentStock: 350, minStock: 70 },
  // Nestle – Noodles & Pasta
  { name: "Nestle Maggi 2-Minute Masala Noodles 70g", sku: "NES-MAG-004", barcode: "8901058004001", hsnCode: "19023000", brand: "Nestle", category: "Noodles & Pasta", purchasePrice: 12, sellingPrice: 15, wholesalePrice: 13, retailPrice: 15, gstPercent: 18, unit: "pcs", currentStock: 500, minStock: 100 },
  { name: "Nestle Maggi Atta Noodles 80g", sku: "NES-MAN-005", barcode: "8901058005001", hsnCode: "19023000", brand: "Nestle", category: "Noodles & Pasta", purchasePrice: 14, sellingPrice: 18, wholesalePrice: 16, retailPrice: 18, gstPercent: 18, unit: "pcs", currentStock: 350, minStock: 80 },
  // HUL – Personal Care
  { name: "Dove Body Wash Deeply Nourishing 500ml", sku: "HUL-DBW-001", barcode: "8901030101001", hsnCode: "33041000", brand: "Hindustan Unilever", category: "Personal Care", purchasePrice: 190, sellingPrice: 235, wholesalePrice: 210, retailPrice: 235, gstPercent: 18, unit: "pcs", currentStock: 75, minStock: 20 },
  { name: "Dove Soap Beauty Cream Bar 100g", sku: "HUL-DSB-002", barcode: "8901030102001", hsnCode: "34011100", brand: "Hindustan Unilever", category: "Personal Care", purchasePrice: 42, sellingPrice: 55, wholesalePrice: 48, retailPrice: 55, gstPercent: 18, unit: "pcs", currentStock: 200, minStock: 50 },
  { name: "Surf Excel Easy Wash 1kg", sku: "HUL-SEW-003", barcode: "8901030103001", hsnCode: "34022000", brand: "Hindustan Unilever", category: "Home Care", purchasePrice: 85, sellingPrice: 108, wholesalePrice: 95, retailPrice: 108, gstPercent: 18, unit: "pcs", currentStock: 130, minStock: 30 },
  { name: "Vim Dish Wash Gel 750ml", sku: "HUL-VIM-004", barcode: "8901030104001", hsnCode: "34022000", brand: "Hindustan Unilever", category: "Home Care", purchasePrice: 88, sellingPrice: 110, wholesalePrice: 97, retailPrice: 110, gstPercent: 18, unit: "pcs", currentStock: 100, minStock: 25 },
  // Dabur – Health & Wellness
  { name: "Dabur Chyawanprash 1kg", sku: "DAB-CHY-001", barcode: "8901030201001", hsnCode: "21069099", brand: "Dabur", category: "Health & Wellness", purchasePrice: 220, sellingPrice: 280, wholesalePrice: 248, retailPrice: 280, gstPercent: 12, unit: "pcs", currentStock: 60, minStock: 15 },
  { name: "Dabur Honey 500g", sku: "DAB-HON-002", barcode: "8901030202001", hsnCode: "04090000", brand: "Dabur", category: "Health & Wellness", purchasePrice: 165, sellingPrice: 210, wholesalePrice: 185, retailPrice: 210, gstPercent: 0, unit: "pcs", currentStock: 90, minStock: 20 },
  { name: "Dabur Lal Dant Manjan 100g", sku: "DAB-LDM-003", barcode: "8901030203001", hsnCode: "33061000", brand: "Dabur", category: "Health & Wellness", purchasePrice: 30, sellingPrice: 40, wholesalePrice: 34, retailPrice: 40, gstPercent: 18, unit: "pcs", currentStock: 120, minStock: 30 },
  // Dabur – Juices & Beverages
  { name: "Dabur Real Mango Juice 1L", sku: "DAB-RMJ-004", barcode: "8901030204001", hsnCode: "20099000", brand: "Dabur", category: "Juices & Beverages", purchasePrice: 72, sellingPrice: 90, wholesalePrice: 80, retailPrice: 90, gstPercent: 12, unit: "pcs", currentStock: 140, minStock: 35 },
  { name: "Dabur Real Mixed Fruit Juice 1L", sku: "DAB-RMF-005", barcode: "8901030205001", hsnCode: "20099000", brand: "Dabur", category: "Juices & Beverages", purchasePrice: 70, sellingPrice: 88, wholesalePrice: 78, retailPrice: 88, gstPercent: 12, unit: "pcs", currentStock: 120, minStock: 30 },
  { name: "Dabur Glucoplus-C Orange 500g", sku: "DAB-GPC-006", barcode: "8901030206001", hsnCode: "21069099", brand: "Dabur", category: "Juices & Beverages", purchasePrice: 95, sellingPrice: 120, wholesalePrice: 106, retailPrice: 120, gstPercent: 18, unit: "pcs", currentStock: 80, minStock: 20 },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log("🌱 Seeding brands...");
    const brandIdMap = {};
    for (const brand of brands) {
      const res = await client.query(
        `INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [brand]
      );
      brandIdMap[brand] = res.rows[0].id;
      console.log(`  ✓ Brand: ${brand} (id=${res.rows[0].id})`);
    }

    console.log("\n🌱 Seeding categories...");
    const categoryIdMap = {};
    for (const [brandName, cats] of Object.entries(categoriesByBrand)) {
      const brandId = brandIdMap[brandName];
      for (const cat of cats) {
        const key = `${brandName}::${cat}`;
        const res = await client.query(
          `INSERT INTO categories (name, brand_id, brand_name) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [cat, brandId, brandName]
        );
        if (res.rows.length > 0) {
          categoryIdMap[key] = res.rows[0].id;
        } else {
          // Already existed — fetch it
          const existing = await client.query(
            `SELECT id FROM categories WHERE name = $1 AND brand_id = $2 LIMIT 1`,
            [cat, brandId]
          );
          categoryIdMap[key] = existing.rows[0].id;
        }
        console.log(`  ✓ Category: ${cat} (brand: ${brandName}, id=${categoryIdMap[key]})`);
      }
    }

    console.log("\n🌱 Seeding products...");
    for (const p of products) {
      const brandId = brandIdMap[p.brand];
      const catKey = `${p.brand}::${p.category}`;
      const categoryId = categoryIdMap[catKey];
      await client.query(
        `INSERT INTO products (name, sku, barcode, hsn_code, category_id, brand_id, purchase_price, selling_price, wholesale_price, retail_price, gst_percent, unit, current_stock, min_stock, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active')
         ON CONFLICT (sku) DO UPDATE SET
           name=EXCLUDED.name, purchase_price=EXCLUDED.purchase_price,
           selling_price=EXCLUDED.selling_price, current_stock=EXCLUDED.current_stock`,
        [p.name, p.sku, p.barcode, p.hsnCode, categoryId, brandId,
         p.purchasePrice, p.sellingPrice, p.wholesalePrice, p.retailPrice,
         p.gstPercent, p.unit, p.currentStock, p.minStock]
      );
      console.log(`  ✓ ${p.name}`);
    }

    console.log("\n✅ Seeding complete!");
    console.log(`   Brands: ${brands.length}`);
    console.log(`   Categories: ${Object.values(categoriesByBrand).flat().length}`);
    console.log(`   Products: ${products.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
