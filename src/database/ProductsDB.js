import Database from './Database.js';

class ProductsDB extends Database {
    async getAllProducts(searchTerm = '') {
        const db = await this.getDB();
        const query = searchTerm
            ? `SELECT * FROM products WHERE name LIKE ? ORDER BY name;`
            : `SELECT * FROM products ORDER BY name;`;
        const stmt = db.prepare(query, searchTerm ? [`%${searchTerm}%`] : []);
        const products = [];
        while (stmt.step()) {
            products.push(stmt.getAsObject());
        }
        stmt.free();
        return products;
    }

    async addProduct(product) {
        const { name, unit, price_per_unit, purchase_price, stock_quantity, min_stock_level } = product;
        const db = await this.getDB();
        db.run(
            `INSERT INTO products (product_id, name, unit, price_per_unit, purchase_price, stock_quantity, min_stock_level, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'));`,
            [Date.now(), name, unit, price_per_unit, purchase_price, stock_quantity, min_stock_level]
        );
        await this.save();
    }

    async updateProduct(product_id, product) {
        const { name, unit, price_per_unit, purchase_price, stock_quantity, min_stock_level } = product;
        const db = await this.getDB();
        db.run(
            `UPDATE products 
             SET name = ?, unit = ?, price_per_unit = ?, purchase_price = ?, stock_quantity = ?, min_stock_level = ? 
             WHERE product_id = ?;`,
            [name, unit, price_per_unit, purchase_price, stock_quantity, min_stock_level, product_id]
        );
        await this.save();
    }

    async deleteProduct(product_id) {
        const db = await this.getDB();
        db.run(`DELETE FROM products WHERE product_id = ?;`, [product_id]);
        await this.save();
    }

    async getTopSellingProducts(limit = 5) {
        const db = await this.getDB();
        const stmt = db.prepare(`
            SELECT p.product_id, p.name, p.unit, SUM(si.quantity) as totalSold
            FROM products p
            LEFT JOIN sale_items si ON p.product_id = si.product_id
            GROUP BY p.product_id
            ORDER BY totalSold DESC, p.name
            LIMIT ?;
        `, [limit]);
        const products = [];
        while (stmt.step()) {
            products.push(stmt.getAsObject());
        }
        stmt.free();
        return products;
    }

    async getTotalProductsCount() {
        const db = await this.getDB();
        const result = db.exec("SELECT COUNT(*) FROM products;");
        if (result.length > 0 && result[0].values && result[0].values.length > 0) {
            return result[0].values[0][0];
        }
        return 0;
    }

    async getLowStockProductsCount() {
        const db = await this.getDB();
        const result = db.exec("SELECT COUNT(*) FROM products WHERE stock_quantity <= min_stock_level;");
        if (result.length > 0 && result[0].values && result[0].values.length > 0) {
            return result[0].values[0][0];
        }
        return 0;
    }

    async getLowStockProducts() {
        const db = await this.getDB();
        const stmt = db.prepare(`
            SELECT product_id, name, stock_quantity, min_stock_level, unit
            FROM products 
            WHERE stock_quantity <= min_stock_level
            ORDER BY (CAST(stock_quantity AS REAL) / min_stock_level) ASC, name ASC;
        `);
        const products = [];
        while (stmt.step()) {
            products.push(stmt.getAsObject());
        }
        stmt.free();
        return products;
    }

    async getTotalCapitalPurchasePrice() {
        const db = await this.getDB();
        const result = db.exec("SELECT SUM(purchase_price * stock_quantity) AS totalCapital FROM products;");
        if (result.length > 0 && result[0].values && result[0].values.length > 0) {
            return result[0].values[0][0] || 0;
        }
        return 0;
    }

    async getTotalCapitalSellPrice() {
        const db = await this.getDB();
        const result = db.exec("SELECT SUM(price_per_unit * stock_quantity) AS totalCapital FROM products;");
        if (result.length > 0 && result[0].values && result[0].values.length > 0) {
            return result[0].values[0][0] || 0;
        }
        return 0;
    }

    async getUnsoldProductsSince(sinceDate) {
        const db = await this.getDB();

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(sinceDate)) {
            throw new Error('تاريخ البداية يجب أن يكون بصيغة YYYY-MM-DD.');
        }

        const stmt = db.prepare(`
            SELECT p.product_id, p.name, p.stock_quantity, p.unit, p.min_stock_level, MAX(s.date) as lastSold
            FROM products p
            LEFT JOIN sale_items si ON p.product_id = si.product_id
            LEFT JOIN sales s ON si.sale_id = s.sale_id
            GROUP BY p.product_id
            HAVING MAX(s.date) IS NULL OR MAX(s.date) < ?
            ORDER BY p.name;
        `, [sinceDate]);

        const products = [];
        while (stmt.step()) {
            products.push(stmt.getAsObject());
        }
        stmt.free();
        return products;
    }

    async getProductById(product_id) {
        const db = await this.getDB();
        const stmt = db.prepare(`SELECT * FROM products WHERE product_id = ?;`, [product_id]);
        let product = null;
        if (stmt.step()) {
            product = stmt.getAsObject();
        }
        stmt.free();
        return product;
    }

    async updateStockQuantity(product_id, quantityChange) {
        const db = await this.getDB();
        db.run(
            `UPDATE products SET stock_quantity = stock_quantity + ? WHERE product_id = ?;`,
            [quantityChange, product_id]
        );
        await this.save();
    }

    async getProductsCreatedAfter(date) {
        const db = await this.getDB();
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            throw new Error('تاريخ البداية يجب أن يكون بصيغة YYYY-MM-DD.');
        }
        const stmt = db.prepare(`SELECT * FROM products WHERE created_at >= ? ORDER BY created_at;`, [date]);
        const products = [];
        while (stmt.step()) {
            products.push(stmt.getAsObject());
        }
        stmt.free();
        return products;
    }
}

export default ProductsDB;