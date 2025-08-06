import Database from './Database.js';

/**
 * Manages sale items in the database, extending the base Database class.
 */
class SaleItemsDB extends Database {
    /**
     * Adds multiple sale items in a single transaction and updates product stock.
     * @param {number} sale_id - The ID of the sale.
     * @param {Array<Object>} items - Array of sale item objects.
     * @returns {Promise<Array<number>>} Array of inserted sale item IDs.
     * @throws {Error} If input is invalid, stock is insufficient, or database error occurs.
     */
    async addBulkSaleItems(sale_id, items) {
        console.log('SaleItemsDB.js: addBulkSaleItems called with:', {
            sale_id,
            items_count: items.length,
            items: JSON.stringify(items, null, 2)
        });

        // التحقق من الإدخال
        if (!Number.isInteger(sale_id) || sale_id <= 0) {
            console.error('SaleItemsDB.js: معرف المبيعة غير صالح:', sale_id);
            throw new Error('Invalid sale_id provided.');
        }
        if (!Array.isArray(items) || items.length === 0) {
            console.error('SaleItemsDB.js: مصفوفة العناصر غير صالحة:', items);
            throw new Error('Items must be a non-empty array.');
        }

        try {
            const db = await this.getDB();
            console.log('SaleItemsDB.js: تم الاتصال بقاعدة البيانات');
            console.log('SaleItemsDB.js: عدد العناصر في sale_items قبل الإدراج:', db.exec('SELECT COUNT(*) FROM sale_items;')[0].values[0][0]);

            // التحقق من وجود المبيعة
            console.log('SaleItemsDB.js: التحقق من وجود المبيعة:', sale_id);
            const saleStmt = db.prepare('SELECT * FROM sales WHERE sale_id = ?;', [sale_id]);
            if (!saleStmt.step()) {
                saleStmt.free();
                console.error('SaleItemsDB.js: المبيعة غير موجودة:', sale_id);
                throw new Error(`Sale with ID ${sale_id} not found.`);
            }
            console.log('SaleItemsDB.js: المبيعة الموجودة:', saleStmt.getAsObject());
            saleStmt.free();
            console.log('SaleItemsDB.js: المبيعة موجودة:', sale_id);

            db.run('BEGIN TRANSACTION;');
            console.log('SaleItemsDB.js: المعاملة بدأت');
            const insertedIds = [];

            try {
                for (const [index, item] of items.entries()) {
                    console.log(`SaleItemsDB.js: معالجة العنصر ${index + 1}:`, JSON.stringify(item, null, 2));
                    const { product_id, quantity, unit_price, discount_amount = 0, total_price } = item;

                    // التحقق من بيانات العنصر
                    if (!Number.isInteger(product_id) || product_id <= 0) {
                        console.error(`SaleItemsDB.js: معرف المنتج غير صالح في العنصر ${index + 1}:`, product_id);
                        throw new Error(`Invalid product_id in item ${index + 1}.`);
                    }
                    if (!Number.isFinite(quantity) || quantity <= 0) {
                        console.error(`SaleItemsDB.js: الكمية غير صالحة في العنصر ${index + 1}:`, quantity);
                        throw new Error(`Invalid quantity in item ${index + 1}.`);
                    }
                    if (!Number.isFinite(unit_price) || unit_price < 0) {
                        console.error(`SaleItemsDB.js: سعر الوحدة غير صالح في العنصر ${index + 1}:`, unit_price);
                        throw new Error(`Invalid unit_price in item ${index + 1}.`);
                    }
                    if (!Number.isFinite(discount_amount) || discount_amount < 0) {
                        console.error(`SaleItemsDB.js: الخصم غير صالح في العنصر ${index + 1}:`, discount_amount);
                        throw new Error(`Invalid discount_amount in item ${index + 1}.`);
                    }
                    if (!Number.isFinite(total_price) || total_price < 0) {
                        console.error(`SaleItemsDB.js: الإجمالي غير صالح في العنصر ${index + 1}:`, total_price);
                        throw new Error(`Invalid total_price in item ${index + 1}.`);
                    }

                    // التحقق من المخزون
                    console.log(`SaleItemsDB.js: التحقق من المخزون للمنتج ${product_id}`);
                    const stockStmt = db.prepare('SELECT stock_quantity, name FROM products WHERE product_id = ?;', [product_id]);
                    let stock = 0;
                    let productName = '';
                    if (stockStmt.step()) {
                        const result = stockStmt.getAsObject();
                        stock = result.stock_quantity;
                        productName = result.name;
                    } else {
                        stockStmt.free();
                        console.error(`SaleItemsDB.js: المنتج غير موجود: ${product_id}`);
                        throw new Error(`Product with ID ${product_id} not found.`);
                    }
                    stockStmt.free();
                    console.log(`SaleItemsDB.js: المخزون المتاح للمنتج ${productName} (ID: ${product_id}): ${stock}`);

                    if (stock < quantity) {
                        console.error(`SaleItemsDB.js: المخزون غير كافٍ للمنتج ${productName} (ID: ${product_id}):`, {
                            available: stock,
                            requested: quantity
                        });
                        throw new Error(`Insufficient stock for product ${productName} (ID: ${product_id}). Available: ${stock}, Requested: ${quantity}`);
                    }

                    // إضافة العنصر
                    const params = [sale_id, product_id, quantity, unit_price, discount_amount, total_price];
                    console.log(`SaleItemsDB.js: إضافة العنصر ${index + 1} مع المعلمات:`, params);
                    const stmt = db.prepare(
                        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, discount_amount, total_price) 
                         VALUES (?, ?, ?, ?, ?, ?);`,
                        params
                    );
                    stmt.run();
                    const saleItemId = db.exec('SELECT last_insert_rowid() AS id;')[0].values[0][0];
                    stmt.free();
                    console.log(`SaleItemsDB.js: تم إضافة العنصر ${index + 1} بمعرف:`, saleItemId);
                    insertedIds.push(saleItemId);

                    // تحديث المخزون
                    console.log(`SaleItemsDB.js: تحديث المخزون للمنتج ${productName} (ID: ${product_id}) بمقدار: -${quantity}`);
                    db.run('UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?;', [quantity, product_id]);

                    // التحقق من تحديث المخزون
                    const updatedStockStmt = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?;', [product_id]);
                    if (updatedStockStmt.step()) {
                        const updatedStock = updatedStockStmt.getAsObject().stock_quantity;
                        console.log(`SaleItemsDB.js: المخزون المحدث للمنتج ${productName} (ID: ${product_id}): ${updatedStock}`);
                    }
                    updatedStockStmt.free();
                }

                db.run('COMMIT;');
                console.log('SaleItemsDB.js: تم تأكيد المعاملة');

                // التحقق من العناصر المدرجة
                const insertedItemsStmt = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?;', [sale_id]);
                const insertedItems = [];
                while (insertedItemsStmt.step()) {
                    insertedItems.push(insertedItemsStmt.getAsObject());
                }
                insertedItemsStmt.free();
                console.log('SaleItemsDB.js: العناصر المدرجة:', JSON.stringify(insertedItems, null, 2));
                console.log('SaleItemsDB.js: عدد العناصر في sale_items بعد الإدراج:', db.exec('SELECT COUNT(*) FROM sale_items;')[0].values[0][0]);

                await this.save();
                console.log('SaleItemsDB.js: تم حفظ قاعدة البيانات بعد إضافة العناصر');
                console.log('SaleItemsDB.js: تم إضافة العناصر بنجاح، المعرفات:', insertedIds);
                return insertedIds;
            } catch (error) {
                db.run('ROLLBACK;');
                console.error('SaleItemsDB.js: خطأ أثناء المعاملة:', error.message, error.stack);
                throw error;
            }
        } catch (error) {
            console.error('SaleItemsDB.js: خطأ في إضافة العناصر:', error.message, error.stack);
            throw new Error(`Failed to add bulk sale items: ${error.message}`);
        }
    }

    /**
     * Retrieves the top sold items by quantity within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @param {number} [limit=5] - Number of top items to retrieve.
     * @returns {Promise<Array<Object>>} Array of top sold items with product details.
     * @throws {Error} If input is invalid or database error occurs.
     */
    async getTopSoldItemsWithDateRange(startDate = '', endDate = '', limit = 5) {
        console.log('SaleItemsDB.js: getTopSoldItemsWithDateRange called with:', { startDate, endDate, limit });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SaleItemsDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SaleItemsDB.js: Database connection established for getTopSoldItemsWithDateRange');
            let query = `
                SELECT p.product_id, p.name as product_name, SUM(si.total_price) as total_revenue
                FROM sale_items si
                JOIN products p ON si.product_id = p.product_id
                JOIN sales s ON si.sale_id = s.sale_id
            `;
            const params = [];
            if (startDate && endDate) {
                query += ` WHERE s.date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` WHERE s.date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` WHERE s.date <= ?`;
                params.push(endDate);
            }
            query += ` GROUP BY p.product_id, p.name ORDER BY total_revenue DESC LIMIT ?`;
            params.push(limit);
            console.debug('SaleItemsDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const topItems = result[0]?.values.map(row => ({
                product_id: row[0],
                product_name: row[1],
                total_revenue: row[2]
            })) || [];
            console.log('SaleItemsDB.js: getTopSoldItemsWithDateRange result:', topItems);
            return topItems;
        } catch (error) {
            console.error('SaleItemsDB.js: Error fetching top sold items:', error.message, error.stack);
            throw new Error(`Failed to fetch top sold items: ${error.message}`);
        }
    }

    /**
     * Updates a sale item in the database.
     * @param {number} sale_item_id - The ID of the sale item to update.
     * @param {Object} saleItem - Sale item details.
     * @returns {Promise<void>}
     * @throws {Error} If input is invalid or database error occurs.
     */
    async updateSaleItem(sale_item_id, saleItem) {
        console.log('SaleItemsDB.js: updateSaleItem called with:', { sale_item_id, saleItem });
        const { sale_id, product_id, quantity, unit_price, discount_amount = 0, total_price } = saleItem;
        if (!Number.isInteger(sale_item_id) || sale_item_id <= 0 ||
            !Number.isInteger(sale_id) || sale_id <= 0 ||
            !Number.isInteger(product_id) || product_id <= 0 ||
            !Number.isFinite(quantity) || quantity <= 0 ||
            !Number.isFinite(unit_price) || unit_price < 0 ||
            !Number.isFinite(discount_amount) || discount_amount < 0 ||
            !Number.isFinite(total_price) || total_price < 0) {
            console.error('SaleItemsDB.js: Invalid sale item data:', { sale_item_id, sale_id, product_id, quantity, unit_price, discount_amount, total_price });
            throw new Error('Invalid sale item data provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SaleItemsDB.js: Database connection established for updateSaleItem');
            db.run(
                `UPDATE sale_items 
                 SET sale_id = ?, product_id = ?, quantity = ?, unit_price = ?, discount_amount = ?, total_price = ? 
                 WHERE sale_item_id = ?;`,
                [sale_id, product_id, quantity, unit_price, discount_amount, total_price, sale_item_id]
            );
            console.log('SaleItemsDB.js: Sale item updated with ID:', sale_item_id);
            await this.save();
            console.debug('SaleItemsDB.js: Database saved after updating sale item');
        } catch (error) {
            console.error('SaleItemsDB.js: Error updating sale item:', error.message, error.stack);
            throw new Error(`Failed to update sale item ${sale_item_id}: ${error.message}`);
        }
    }

    /**
     * Deletes a single sale item, restores its stock, and recalculates the parent sale's totals.
     * This operation is performed in a single transaction.
     * @param {number} sale_item_id - The ID of the sale item to delete.
     * @returns {Promise<void>}
     * @throws {Error} If input is invalid or database error occurs.
     */
    async deleteSaleItem(sale_item_id) {
        console.log('SaleItemsDB.js: deleteSaleItem called with:', sale_item_id);
        if (!Number.isInteger(sale_item_id) || sale_item_id <= 0) {
            console.error('SaleItemsDB.js: Invalid sale_item_id:', sale_item_id);
            throw new Error('Invalid sale_item_id provided.');
        }

        const db = await this.getDB();
        db.run('BEGIN TRANSACTION;');
        console.debug(`SaleItemsDB.js: Transaction started for deleting item ${sale_item_id}.`);

        try {
            // Step 1: Get the item's details before deleting it.
            const itemStmt = db.prepare('SELECT sale_id, product_id, quantity FROM sale_items WHERE sale_item_id = ?;', [sale_item_id]);
            let itemToDelete;
            if (itemStmt.step()) {
                itemToDelete = itemStmt.getAsObject();
            }
            itemStmt.free();

            if (!itemToDelete) {
                throw new Error(`Sale item with ID ${sale_item_id} not found.`);
            }
            console.debug('SaleItemsDB.js: Item to delete:', itemToDelete);
            
            // Step 2: Restore the stock for the product.
            console.debug(`SaleItemsDB.js: Restocking product ${itemToDelete.product_id} by ${itemToDelete.quantity}.`);
            db.run('UPDATE products SET stock_quantity = stock_quantity + ? WHERE product_id = ?;', [itemToDelete.quantity, itemToDelete.product_id]);

            // Step 3: Delete the sale item itself.
            console.debug(`SaleItemsDB.js: Deleting sale item ${sale_item_id}.`);
            db.run('DELETE FROM sale_items WHERE sale_item_id = ?;', [sale_item_id]);

            // Step 4: Recalculate the parent sale's totals.
            const sale_id = itemToDelete.sale_id;
            console.debug(`SaleItemsDB.js: Recalculating totals for sale ${sale_id}.`);

            // Get original sale-level discount and paid amount.
            const saleDataStmt = db.prepare('SELECT sale_discount_amount, paid FROM sales WHERE sale_id = ?;', [sale_id]);
            let saleDiscount = 0;
            let paidAmount = 0;
            if (saleDataStmt.step()) {
                const saleData = saleDataStmt.getAsObject();
                saleDiscount = saleData.sale_discount_amount;
                paidAmount = saleData.paid;
            }
            saleDataStmt.free();

            // Calculate new totals from remaining items.
            const totalsStmt = db.prepare(`
                SELECT 
                    SUM(quantity * unit_price) as new_subtotal,
                    SUM(discount_amount) as new_total_item_discount,
                    SUM(total_price) as new_total
                FROM sale_items 
                WHERE sale_id = ?;
            `, [sale_id]);
            
            let newSubtotal = 0;
            let newTotal = 0;
            
            if (totalsStmt.step()) {
                const result = totalsStmt.getAsObject();
                newSubtotal = result.new_subtotal || 0;
                // The new total is the sum of remaining item totals.
                let newTotalFromItems = result.new_total || 0;
                // Apply the overall sale discount to the new item total.
                newTotal = newTotalFromItems - saleDiscount;
            }
            totalsStmt.free();

            const newRemaining = newTotal - paidAmount;
            
            console.debug('SaleItemsDB.js: New sale values:', { newSubtotal, newTotal, newRemaining });

            // Step 5: Update the sales table with the new values.
            db.run(
                'UPDATE sales SET subtotal = ?, total = ?, remaining = ? WHERE sale_id = ?;',
                [newSubtotal, newTotal, newRemaining, sale_id]
            );

            // If all steps succeeded, commit.
            db.run('COMMIT;');
            console.log(`SaleItemsDB.js: Successfully deleted item ${sale_item_id} and updated sale ${sale_id}.`);
            
            await this.save();
            console.debug('SaleItemsDB.js: Database saved after deleting item.');

        } catch (error) {
            console.error(`SaleItemsDB.js: Error during deleteSaleItem transaction, rolling back.`, error.message, error.stack);
            db.run('ROLLBACK;');
            throw new Error(`Failed to delete sale item ${sale_item_id}: ${error.message}`);
        }
    }

    /**
     * Retrieves a sale item by its ID.
     * @param {number} sale_item_id - The ID of the sale item.
     * @returns {Promise<Object|null>} The sale item object or null if not found.
     * @throws {Error} If input is invalid or database error occurs.
     */
    async getSaleItemById(sale_item_id) {
        console.log('SaleItemsDB.js: getSaleItemById called with:', sale_item_id);
        if (!Number.isInteger(sale_item_id) || sale_item_id <= 0) {
            console.error('SaleItemsDB.js: Invalid sale_item_id:', sale_item_id);
            throw new Error('Invalid sale_item_id provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SaleItemsDB.js: Database connection established for getSaleItemById');
            const stmt = db.prepare(
                `SELECT si.*, p.name as product_name 
                 FROM sale_items si 
                 JOIN products p ON si.product_id = p.product_id 
                 WHERE si.sale_item_id = ?;`,
                [sale_item_id]
            );
            let item = null;
            if (stmt.step()) {
                item = stmt.getAsObject();
                console.debug('SaleItemsDB.js: Sale item retrieved:', item);
            }
            stmt.free();
            console.log('SaleItemsDB.js: getSaleItemById result:', item || 'null');
            return item;
        } catch (error) {
            console.error('SaleItemsDB.js: Error fetching sale item:', error.message, error.stack);
            throw new Error(`Failed to fetch sale item ${sale_item_id}: ${error.message}`);
        }
    }

    /**
     * Calculates the total quantity of items sold within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<number>} Total quantity of items sold.
     * @throws {Error} If date format is invalid or database error occurs.
     */
    async getTotalItemsSold(startDate = '', endDate = '') {
        console.log('SaleItemsDB.js: getTotalItemsSold called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SaleItemsDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SaleItemsDB.js: Database connection established for getTotalItemsSold');
            let query = `SELECT SUM(si.quantity) as total_quantity 
                         FROM sale_items si 
                         JOIN sales s ON si.sale_id = s.sale_id`;
            const params = [];
            if (startDate && endDate) {
                query += ` WHERE s.date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` WHERE s.date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` WHERE s.date <= ?`;
                params.push(endDate);
            }
            console.debug('SaleItemsDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const total = result[0].values[0][0] || 0;
            console.log('SaleItemsDB.js: getTotalItemsSold result:', total);
            return total;
        } catch (error) {
            console.error('SaleItemsDB.js: Error calculating total items sold:', error.message, error.stack);
            throw new Error(`Failed to calculate total items sold: ${error.message}`);
        }
    }

    /**
     * Retrieves the top sold items by quantity.
     * @param {number} [limit=5] - Number of top items to retrieve.
     * @returns {Promise<Array<Object>>} Array of top sold items with product details.
     * @throws {Error} If limit is invalid or database error occurs.
     */
    async getTopSoldItems(limit = 5) {
        console.log('SaleItemsDB.js: getTopSoldItems called with limit:', limit);
        if (!Number.isInteger(limit) || limit <= 0) {
            console.error('SaleItemsDB.js: Invalid limit:', limit);
            throw new Error('Invalid limit provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SaleItemsDB.js: Database connection established for getTopSoldItems');
            const stmt = db.prepare(
                `SELECT si.product_id, p.name as product_name, SUM(si.quantity) as total_quantity, SUM(si.total_price) as total_revenue
                 FROM sale_items si
                 JOIN products p ON si.product_id = p.product_id
                 GROUP BY si.product_id
                 ORDER BY total_quantity DESC, p.name
                 LIMIT ?;`,
                [limit]
            );
            const items = [];
            while (stmt.step()) {
                items.push(stmt.getAsObject());
            }
            stmt.free();
            console.log('SaleItemsDB.js: getTopSoldItems retrieved:', items.length, 'items');
            console.debug('SaleItemsDB.js: Top sold items:', items);
            return items;
        } catch (error) {
            console.error('SaleItemsDB.js: Error fetching top sold items:', error.message, error.stack);
            throw new Error(`Failed to fetch top sold items: ${error.message}`);
        }
    }

    /**
     * Retrieves sale items for a specific sale.
     * @param {number} sale_id - The ID of the sale.
     * @returns {Promise<Array<Object>>} Array of sale items with product details.
     * @throws {Error} If sale_id is invalid or database error occurs.
     */
    async getSaleItemsBySale(sale_id) {
        if (!Number.isInteger(sale_id) || sale_id <= 0) {
            throw new Error('Invalid sale_id provided.');
        }
        const db = await this.getDB();
        const query = `
            SELECT 
                si.sale_item_id, si.sale_id, si.product_id, si.quantity, si.unit_price, 
                si.discount_amount, si.total_price,
                p.name as product_name,
                (si.total_price - (si.quantity * COALESCE(p.purchase_price, 0))) as item_profit
            FROM sale_items si
            LEFT JOIN products p ON si.product_id = p.product_id
            WHERE si.sale_id = ?
            ORDER BY p.name;
        `;
        const stmt = db.prepare(query, [sale_id]);
        const items = [];
        while (stmt.step()) {
            items.push(stmt.getAsObject());
        }
        stmt.free();
        return items;
    }

    /**
     * Adds a single sale item to the database and updates product stock.
     * @param {Object} saleItem - Sale item details.
     * @returns {Promise<number>} The ID of the inserted sale item.
     * @throws {Error} If input is invalid, stock is insufficient, or database error occurs.
     */
    async addSaleItem(saleItem) {
        console.log('SaleItemsDB.js: addSaleItem called with:', saleItem);
        const { sale_id, product_id, quantity, unit_price, discount_amount = 0, total_price } = saleItem;
        if (!Number.isInteger(sale_id) || sale_id <= 0 ||
            !Number.isInteger(product_id) || product_id <= 0 ||
            !Number.isFinite(quantity) || quantity <= 0 ||
            !Number.isFinite(unit_price) || unit_price < 0 ||
            !Number.isFinite(discount_amount) || discount_amount < 0 ||
            !Number.isFinite(total_price) || total_price < 0) {
            console.error('SaleItemsDB.js: Invalid sale item data:', { sale_id, product_id, quantity, unit_price, discount_amount, total_price });
            throw new Error('Invalid sale item data provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SaleItemsDB.js: Database connection established for addSaleItem');
            db.run('BEGIN TRANSACTION;');
            try {
                // Check available stock
                console.log('SaleItemsDB.js: Checking stock for product_id:', product_id);
                const stockStmt = db.prepare('SELECT stock_quantity FROM products WHERE product_id = ?;', [product_id]);
                let stock = 0;
                if (stockStmt.step()) {
                    stock = stockStmt.getAsObject().stock_quantity;
                } else {
                    stockStmt.free();
                    console.error('SaleItemsDB.js: Product not found:', product_id);
                    throw new Error(`Product with ID ${product_id} not found.`);
                }
                stockStmt.free();
                console.log('SaleItemsDB.js: Available stock:', stock);
                if (stock < quantity) {
                    console.error('SaleItemsDB.js: Insufficient stock for product_id:', product_id, 'Available:', stock, 'Requested:', quantity);
                    throw new Error(`Insufficient stock for product_id ${product_id}. Available: ${stock}, Requested: ${quantity}`);
                }

                // Add sale item
                const params = [sale_id, product_id, quantity, unit_price, discount_amount, total_price];
                console.debug('SaleItemsDB.js: Executing insert query with params:', params);
                const stmt = db.prepare(
                    `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, discount_amount, total_price) 
                     VALUES (?, ?, ?, ?, ?, ?);`,
                    params
                );
                stmt.run();
                const saleItemId = db.exec('SELECT last_insert_rowid() AS id;')[0].values[0][0];
                stmt.free();
                console.log('SaleItemsDB.js: Sale item added with ID:', saleItemId);

                // Update stock
                console.debug('SaleItemsDB.js: Updating stock for product_id:', product_id, 'Quantity:', quantity);
                db.run('UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?;', [quantity, product_id]);

                db.run('COMMIT;');
                console.debug('SaleItemsDB.js: Transaction committed for addSaleItem');
                await this.save();
                console.debug('SaleItemsDB.js: Database saved after adding sale item');
                console.log('SaleItemsDB.js: Sale item added successfully with ID:', saleItemId);
                return saleItemId;
            } catch (error) {
                db.run('ROLLBACK;');
                console.error('SaleItemsDB.js: Error during addSaleItem transaction:', error.message, error.stack);
                throw error;
            }
        } catch (error) {
            console.error('SaleItemsDB.js: Error adding sale item:', error.message, error.stack);
            throw new Error(`Failed to add sale item: ${error.message}`);
        }
    }

    /**
     * Calculates the total revenue from sale items within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<number>} Total revenue from sale items.
     * @throws {Error} If date format is invalid or database error occurs.
     */
    async getTotalRevenue(startDate = '', endDate = '') {
        console.log('SaleItemsDB.js: getTotalRevenue called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SaleItemsDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SaleItemsDB.js: Database connection established for getTotalRevenue');
            let query = `SELECT SUM(si.total_price) as total_revenue 
                         FROM sale_items si 
                         JOIN sales s ON si.sale_id = s.sale_id`;
            const params = [];
            if (startDate && endDate) {
                query += ` WHERE s.date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` WHERE s.date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` WHERE s.date <= ?`;
                params.push(endDate);
            }
            console.debug('SaleItemsDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const totalRevenue = result[0].values[0][0] || 0;
            console.log('SaleItemsDB.js: getTotalRevenue result:', totalRevenue);
            return totalRevenue;
        } catch (error) {
            console.error('SaleItemsDB.js: Error calculating total revenue:', error.message, error.stack);
            throw new Error(`Failed to calculate total revenue: ${error.message}`);
        }
    }
}

export default SaleItemsDB;