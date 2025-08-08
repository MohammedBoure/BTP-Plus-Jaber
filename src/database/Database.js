const initSqlJs = window.initSqlJs;
const INDEXEDDB_NAME = 'sqljs-database';

class Database {
    constructor() {
        this.db = null;
        this.SQL = null;
        this.initializationPromise = this.initialize();
    }

    async initialize() {
        try {
            this.SQL = await initSqlJs({ locateFile: () => '/libs/sql.js/sql-wasm.wasm' });
            const savedDb = await this._loadDBFromIndexedDB();
            if (savedDb) {
                console.log("جارٍ تحميل قاعدة البيانات من IndexedDB...");
                this.db = new this.SQL.Database(savedDb);
                const salesCount = this.db.exec(`SELECT COUNT(*) AS count FROM sales`)[0].values[0][0];
                console.log("عدد المبيعات الموجودة:", salesCount);
            } else {
                console.log("إنشاء قاعدة بيانات جديدة...");
                this.db = new this.SQL.Database();
                this.createTables();
                // --- THIS IS THE NEW PART ---
                // Seed the database with initial data only on the first run.
                //await this._seedInitialData();
                // --- END OF NEW PART ---
                await this.save();
            }
            const productCount = this.db.exec(`SELECT COUNT(*) AS count FROM products`)[0].values[0][0];
            console.log("عدد المنتجات بعد التهيئة:", productCount);
        } catch (error) {
            console.error('فشل تهيئة قاعدة البيانات:', error);
            throw error;
        }
    }

    async _loadDBFromIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open(INDEXEDDB_NAME, 1);
            request.onerror = (event) => { console.error("خطأ IndexedDB:", request.error); resolve(null); };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('database_file')) { db.createObjectStore('database_file'); }
            };
            request.onsuccess = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('database_file')) { console.warn("مخزن database_file غير موجود"); db.close(); resolve(null); return; }
                const transaction = db.transaction(['database_file'], 'readonly');
                const store = transaction.objectStore('database_file');
                const getReq = store.get('sqljs_db_blob');
                getReq.onsuccess = () => {
                    if (getReq.result) { console.log("تم استرجاع قاعدة البيانات من IndexedDB بنجاح", { size: getReq.result.length }); resolve(getReq.result);
                    } else { console.warn("لم يتم العثور على بيانات في IndexedDB"); resolve(null); }
                };
                getReq.onerror = (event) => { console.error("فشل جلب البيانات من IndexedDB:", event.target.error); resolve(null); };
                transaction.oncomplete = () => db.close();
                transaction.onerror = (event) => { console.error("خطأ في المعاملة:", event.target.error); resolve(null); };
            };
        });
    }

    async save() {
        if (!this.db) { console.error("لا توجد قاعدة بيانات لحفظها."); throw new Error("No database to save."); }
        const data = this.db.export();
        console.log("حجم البيانات المصدرة:", data.length);
        try {
            await new Promise((resolve, reject) => {
                const request = indexedDB.open(INDEXEDDB_NAME, 1);
                request.onerror = (event) => { console.error("خطأ في فتح IndexedDB:", event.target.error); reject(event.target.error); };
                request.onupgradeneeded = (event) => { const db = event.target.result; if (!db.objectStoreNames.contains('database_file')) { db.createObjectStore('database_file'); } };
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const transaction = db.transaction(['database_file'], 'readwrite');
                    const store = transaction.objectStore('database_file');
                    const putReq = store.put(data, 'sqljs_db_blob');
                    putReq.onsuccess = () => { console.log("تم حفظ قاعدة البيانات في IndexedDB بنجاح."); resolve(); };
                    putReq.onerror = (event) => { console.error("فشل حفظ البيانات في IndexedDB:", event.target.error); reject(event.target.error); };
                    transaction.oncomplete = () => db.close();
                    transaction.onerror = (event) => { console.error("خطأ في المعاملة:", event.target.error); reject(event.target.error); };
                };
            });
        } catch (error) { console.error("فشل حفظ قاعدة البيانات:", error); throw error; }
    }

    createTables() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS products (
                product_id INTEGER PRIMARY KEY, 
                name TEXT NOT NULL, 
                unit TEXT NOT NULL, 
                price_per_unit REAL NOT NULL, 
                purchase_price REAL NOT NULL, 
                stock_quantity REAL NOT NULL, 
                min_stock_level REAL NOT NULL, 
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        this.db.run(`
            CREATE TABLE IF NOT EXISTS clients (
                client_id INTEGER PRIMARY KEY, 
                name TEXT NOT NULL, 
                phone TEXT, 
                address TEXT, 
                is_regular BOOLEAN DEFAULT 0, 
                notes TEXT
            );
        `);
        this.db.run(`
            CREATE TABLE IF NOT EXISTS sales (
                sale_id INTEGER PRIMARY KEY AUTOINCREMENT, 
                client_id INTEGER, 
                date DATE NOT NULL, 
                subtotal REAL NOT NULL, 
                sale_discount_amount REAL NOT NULL DEFAULT 0, 
                delivery_price REAL NOT NULL DEFAULT 0, -- حقل جديد لتكلفة التوصيل
                total REAL NOT NULL, 
                paid REAL NOT NULL, 
                remaining REAL NOT NULL, 
                is_credit BOOLEAN DEFAULT 0, 
                FOREIGN KEY (client_id) REFERENCES clients(client_id)
            );
        `);
        this.db.run(`
            CREATE TABLE IF NOT EXISTS sale_items (
                sale_item_id INTEGER PRIMARY KEY AUTOINCREMENT, 
                sale_id INTEGER NOT NULL, 
                product_id INTEGER NOT NULL, 
                quantity REAL NOT NULL, 
                unit_price REAL NOT NULL, 
                discount_amount REAL NOT NULL DEFAULT 0, 
                total_price REAL NOT NULL, 
                FOREIGN KEY (sale_id) REFERENCES sales(sale_id), 
                FOREIGN KEY (product_id) REFERENCES products(product_id)
            );
        `);
        this.db.run(`
            CREATE TABLE IF NOT EXISTS payments (
                payment_id INTEGER PRIMARY KEY, 
                client_id INTEGER NOT NULL, 
                date DATE NOT NULL, 
                amount REAL NOT NULL, 
                notes TEXT, 
                FOREIGN KEY (client_id) REFERENCES clients(client_id)
            );
        `);
        // جدول جديد لطلبات الشراء (اختياري)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS purchase_orders (
                purchase_order_id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id INTEGER, -- يمكن إضافة جدول suppliers إذا لزم
                date DATE NOT NULL,
                subtotal REAL NOT NULL,
                delivery_price REAL NOT NULL DEFAULT 0,
                total REAL NOT NULL,
                notes TEXT
            );
        `);
    }

    // =================================================================
    // NEW FUNCTION TO SEED INITIAL DATA
    // =================================================================
    async _seedInitialData() {
        console.log("قاعدة بيانات جديدة. جارٍ إدخال البيانات الأولية...");
        try {
            this.db.exec("BEGIN TRANSACTION;");

            // 1. Products (بدون تغيير)
            const products = [
                { id: 1, name: 'أسمنت بورتلاندي', unit: 'كيس (50 كجم)', price: 15, purchase: 12, stock: 500, min: 50 },
                { id: 2, name: 'رمل بناء ناعم', unit: 'متر مكعب', price: 25, purchase: 18, stock: 100, min: 10 },
                { id: 3, name: 'حصى (بحص) مقاس 3/4', unit: 'متر مكعب', price: 30, purchase: 22, stock: 80, min: 10 },
                { id: 4, name: 'حديد تسليح 16 مم', unit: 'طن', price: 1200, purchase: 1050, stock: 20, min: 2 },
                { id: 5, name: 'حديد تسليح 12 مم', unit: 'طن', price: 1250, purchase: 1100, stock: 25, min: 3 },
                { id: 6, name: 'طوب أحمر مصمت', unit: 'ألف طوبة', price: 400, purchase: 320, stock: 50, min: 5 },
                { id: 7, name: 'بلوك أسمنتي 20 سم', unit: 'قطعة', price: 1.5, purchase: 1.1, stock: 2000, min: 200 },
                { id: 8, name: 'جبس بناء', unit: 'كيس (25 كجم)', price: 8, purchase: 6, stock: 300, min: 30 },
                { id: 9, name: 'عازل مائي (رولات)', unit: 'لفة (10 متر)', price: 50, purchase: 40, stock: 100, min: 10 },
                { id: 10, name: 'خشب بناء (مورين)', unit: 'لوح', price: 20, purchase: 15, stock: 400, min: 50 }
            ];
            const productStmt = this.db.prepare("INSERT INTO products (product_id, name, unit, price_per_unit, purchase_price, stock_quantity, min_stock_level) VALUES (?, ?, ?, ?, ?, ?, ?)");
            products.forEach(p => productStmt.run([p.id, p.name, p.unit, p.price, p.purchase, p.stock, p.min]));
            productStmt.free();

            // 2. Clients (بدون تغيير)
            const clients = Array.from({ length: 30 }, (_, i) => ({ id: Date.now() + i, name: `العميل رقم ${i + 1}`, phone: `05012345${i.toString().padStart(2, '0')}`, address: `العنوان ${i+1}` }));
            const clientStmt = this.db.prepare("INSERT INTO clients (client_id, name, phone, address) VALUES (?, ?, ?, ?)");
            clients.forEach(c => clientStmt.run([c.id, c.name, c.phone, c.address]));
            clientStmt.free();

            // 3. Sales, Sale Items, and Payments (مع إضافة تكلفة التوصيل)
            const saleStmt = this.db.prepare("INSERT INTO sales (client_id, date, subtotal, sale_discount_amount, delivery_price, total, paid, remaining, is_credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            const itemStmt = this.db.prepare("INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)");
            const paymentStmt = this.db.prepare("INSERT INTO payments (payment_id, client_id, date, amount, notes) VALUES (?, ?, ?, ?, ?)");
            
            for (let i = 0; i < 250; i++) {
                const client = clients[Math.floor(Math.random() * clients.length)];
                const saleDate = new Date();
                saleDate.setDate(saleDate.getDate() - Math.floor(Math.random() * 730));
                
                let subtotal = 0;
                const saleItems = [];
                const numItems = Math.floor(Math.random() * 5) + 1;
                const usedProductIds = new Set();

                for (let j = 0; j < numItems; j++) {
                    let product;
                    do { product = products[Math.floor(Math.random() * products.length)]; } while (usedProductIds.has(product.id));
                    usedProductIds.add(product.id);

                    const quantity = Math.floor(Math.random() * 10) + 1;
                    const itemTotal = quantity * product.price;
                    subtotal += itemTotal;
                    saleItems.push({ product_id: product.id, quantity, unit_price: product.price, total_price: itemTotal });
                }
                
                const saleDiscount = Math.random() < 0.3 ? subtotal * (Math.random() * 0.1) : 0; // خصم عشوائي بنسبة 30%
                const deliveryPrice = Math.random() < 0.6 ? (Math.random() * 50 + 10).toFixed(2) : 0; // تكلفة توصيل عشوائية بنسبة 60%
                const total = (subtotal - saleDiscount + parseFloat(deliveryPrice)).toFixed(2);
                const isCredit = Math.random() < 0.4; // 40% chance of credit sale
                let paid = total;
                let remaining = 0;

                if (isCredit) {
                    paid = (total * (Math.random() * 0.5)).toFixed(2);
                    remaining = (total - paid).toFixed(2);
                }

                saleStmt.run([client.id, saleDate.toISOString().slice(0, 10), subtotal.toFixed(2), saleDiscount.toFixed(2), deliveryPrice, total, paid, remaining, isCredit ? 1 : 0]);
                const saleId = this.db.exec("SELECT last_insert_rowid()")[0].values[0][0];

                saleItems.forEach(item => { itemStmt.run([saleId, item.product_id, item.quantity, item.unit_price, item.total_price]); });
                
                if (isCredit && remaining > 1) {
                    const paymentDate = new Date(saleDate);
                    paymentDate.setDate(paymentDate.getDate() + Math.floor(Math.random() * 30) + 15);
                    const paymentAmount = (remaining * (Math.random() * 0.4 + 0.1)).toFixed(2);
                    paymentStmt.run([Date.now() + i, client.id, paymentDate.toISOString().slice(0, 10), paymentAmount, `دفعة لفاتورة #${saleId}`]);
                }
            }
            saleStmt.free();
            itemStmt.free();
            paymentStmt.free();

            // 4. Purchase Orders (اختياري)
            const purchaseStmt = this.db.prepare("INSERT INTO purchase_orders (supplier_id, date, subtotal, delivery_price, total, notes) VALUES (?, ?, ?, ?, ?, ?)");
            for (let i = 0; i < 50; i++) {
                const supplierId = Math.floor(Math.random() * 1000) + 1; // يمكن استبداله بجدول موردين
                const purchaseDate = new Date();
                purchaseDate.setDate(purchaseDate.getDate() - Math.floor(Math.random() * 730));
                const purchaseSubtotal = (Math.random() * 5000 + 1000).toFixed(2);
                const purchaseDeliveryPrice = (Math.random() * 100 + 20).toFixed(2);
                const purchaseTotal = (parseFloat(purchaseSubtotal) + parseFloat(purchaseDeliveryPrice)).toFixed(2);
                purchaseStmt.run([supplierId, purchaseDate.toISOString().slice(0, 10), purchaseSubtotal, purchaseDeliveryPrice, purchaseTotal, `طلب شراء #${i + 1}`]);
            }
            purchaseStmt.free();

            this.db.exec("COMMIT;");
            console.log("✅ تم إدخال البيانات الأولية بنجاح.");

        } catch (e) {
            console.error("فشل إدخال البيانات الأولية، يتم التراجع:", e);
            this.db.exec("ROLLBACK;");
            throw e;
        }
    }

    async getDB() { await this.initializationPromise; if (!this.db) throw new Error('قاعدة البيانات غير مهيأة أو فشل في التهيئة.'); return this.db; }
    async hasData() { try { const db = await this.getDB(); const result = db.exec('SELECT COUNT(*) AS count FROM sqlite_master WHERE type="table"'); return result[0].values[0][0] > 0; } catch (error) { console.error('خطأ في فحص بيانات قاعدة البيانات:', error); return false; } }
    async backup() { try { const db = await this.getDB(); const data = db.export(); const blob = new Blob([data], { type: 'application/sql' }); return new File([blob], `backup_${new Date().toISOString()}.sql`, { type: 'application/sql' }); } catch (error) { console.error('فشل النسخ الاحتياطي:', error); throw error; } }
    async restore(file) { try { const SQL = await initSqlJs({ locateFile: () => '/libs/sql.js/sql-wasm.wasm' }); const reader = new FileReader(); await new Promise((resolve, reject) => { reader.onload = () => { try { const arrayBuffer = reader.result; const uInt8Array = new Uint8Array(arrayBuffer); this.db = new SQL.Database(uInt8Array); resolve(); } catch (e) { reject(e); } }; reader.onerror = reject; reader.readAsArrayBuffer(file); }); await this.save(); console.log("تم استعادة قاعدة البيانات وحفظها في IndexedDB."); } catch (error) { console.error('فشل استعادة قاعدة البيانات:', error); throw error; } }
    async deleteAllData() {
        const db = await this.getDB();
        const tables = ['products', 'clients', 'sales', 'sale_items', 'payments'];
        tables.forEach(table => db.run(`DELETE FROM ${table};`));
        db.run(`DELETE FROM sqlite_sequence;`);
        console.log("✅ تم حذف كل السجلات من الجداول بنجاح.");
        await new Promise((resolve, reject) => { const deleteRequest = indexedDB.deleteDatabase(INDEXEDDB_NAME); deleteRequest.onsuccess = () => { console.log("🗑️ تم حذف قاعدة بيانات IndexedDB بالكامل."); resolve(); }; deleteRequest.onerror = (event) => { console.error("❌ فشل حذف قاعدة بيانات IndexedDB:", event.target.error); reject(event.target.error); }; deleteRequest.onblocked = () => { console.warn("⚠️ الحذف محجوز بسبب اتصال مفتوح. أعد تشغيل المتصفح إن لزم."); }; });
        console.log("✅ كل شيء تم حذفه بنجاح.");
    }
}

export default Database;