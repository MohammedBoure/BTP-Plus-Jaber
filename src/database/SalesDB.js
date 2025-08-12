import Database from './Database.js';

/**
 * Manages sales in the database, extending the base Database class.
 */
class SalesDB extends Database {
    /**
     * Adds a new sale to the database.
     * @param {Object} sale - Sale details {client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit}.
     * @returns {Promise<number>} The ID of the newly inserted sale.
     * @throws {Error} If input is invalid or database error occurs.
     */
    async addSale(sale) {
        console.log('SalesDB.js: addSale called with:', JSON.stringify(sale, null, 2));
        const { client_id, date, subtotal, sale_discount_amount = 0, delivery_price = 0, labor_cost = 0, total, paid, remaining, is_credit } = sale;
        
        // Validate input
        console.log('SalesDB.js: Validating sale data');
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.error('SalesDB.js: Invalid date format:', date);
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        if (!Number.isFinite(subtotal) || subtotal < 0) {
            console.error('SalesDB.js: Invalid subtotal:', subtotal);
            throw new Error('Invalid subtotal provided.');
        }
        if (!Number.isFinite(sale_discount_amount) || sale_discount_amount < 0) {
            console.error('SalesDB.js: Invalid sale discount amount:', sale_discount_amount);
            throw new Error('Invalid sale discount amount provided.');
        }
        if (!Number.isFinite(delivery_price) || delivery_price < 0) {
            console.error('SalesDB.js: Invalid delivery price:', delivery_price);
            throw new Error('Invalid delivery price provided.');
        }
        if (!Number.isFinite(labor_cost) || labor_cost < 0) {
            console.error('SalesDB.js: Invalid labor cost:', labor_cost);
            throw new Error('Invalid labor cost provided.');
        }
        if (!Number.isFinite(total) || total < 0) {
            console.error('SalesDB.js: Invalid total:', total);
            throw new Error('Invalid total provided.');
        }
        if (!Number.isFinite(paid) || paid < 0) {
            console.error('SalesDB.js: Invalid paid amount:', paid);
            throw new Error('Invalid paid amount provided.');
        }
        if (!Number.isFinite(remaining) || remaining < 0) {
            console.error('SalesDB.js: Invalid remaining amount:', remaining);
            throw new Error('Invalid remaining amount provided.');
        }
        if (client_id && (!Number.isInteger(client_id) || client_id <= 0)) {
            console.error('SalesDB.js: Invalid client_id:', client_id);
            throw new Error('Invalid client_id provided.');
        }

        try {
            const db = await this.getDB();
            console.log('SalesDB.js: Database connection established');
            console.log('SalesDB.js: Number of sales before insert:', db.exec('SELECT COUNT(*) FROM sales;')[0].values[0][0]);

            // Verify client exists if provided
            if (client_id) {
                console.log('SalesDB.js: Checking client existence:', client_id);
                const clientStmt = db.prepare('SELECT 1 FROM clients WHERE client_id = ?;', [client_id]);
                if (!clientStmt.step()) {
                    clientStmt.free();
                    console.error('SalesDB.js: Client not found:', client_id);
                    throw new Error(`Client with ID ${client_id} not found.`);
                }
                clientStmt.free();
                console.log('SalesDB.js: Client exists:', client_id);
            }

            // Insert sale
            const params = [client_id || null, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit ? 1 : 0];
            console.log('SalesDB.js: Executing insert query with params:', params);
            const stmt = db.prepare(
                `INSERT INTO sales (client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                params
            );
            stmt.run();
            const sale_id = db.exec('SELECT last_insert_rowid() AS id;')[0].values[0][0];
            stmt.free();
            console.log('SalesDB.js: Sale added with ID:', sale_id);

            // Verify insertion
            const insertedSale = db.prepare('SELECT * FROM sales WHERE sale_id = ?;', [sale_id]);
            if (insertedSale.step()) {
                console.log('SalesDB.js: Inserted sale data:', insertedSale.getAsObject());
            } else {
                console.error('SalesDB.js: Failed to retrieve inserted sale:', sale_id);
            }
            insertedSale.free();

            console.log('SalesDB.js: Number of sales after insert:', db.exec('SELECT COUNT(*) FROM sales;')[0].values[0][0]);

            await this.save();
            console.log('SalesDB.js: Database saved after adding sale');
            return sale_id;
        } catch (error) {
            console.error('SalesDB.js: Error adding sale:', error.message, error.stack);
            throw new Error(`Failed to add sale: ${error.message}`);
        }
    }

    /**
     * Calculates the total revenue from cash sales (non-credit) within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<number>} Total revenue from cash sales.
     * @throws {Error} If date format is invalid or database error occurs.
     */
    async getTotalCashRevenue(startDate = '', endDate = '') {
        console.log('SalesDB.js: getTotalCashRevenue called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SalesDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getTotalCashRevenue');
            let query = `SELECT SUM(si.total_price) as total_cash_revenue 
                         FROM sale_items si 
                         JOIN sales s ON si.sale_id = s.sale_id 
                         WHERE s.is_credit = 0`;
            const params = [];
            if (startDate && endDate) {
                query += ` AND s.date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` AND s.date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` AND s.date <= ?`;
                params.push(endDate);
            }
            console.debug('SalesDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const totalCashRevenue = result[0].values[0][0] || 0;
            console.log('SalesDB.js: getTotalCashRevenue result:', totalCashRevenue);
            return totalCashRevenue;
        } catch (error) {
            console.error('SalesDB.js: Error calculating total cash revenue:', error.message, error.stack);
            throw new Error(`Failed to calculate total cash revenue: ${error.message}`);
        }
    }

    /**
     * Calculates the total remaining amount from credit sales within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<number>} Total remaining amount from credit sales.
     * @throws {Error} If date format is invalid or database error occurs.
     */
    async getTotalRemaining(startDate = '', endDate = '') {
        console.log('SalesDB.js: getTotalRemaining called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SalesDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getTotalRemaining');
            let query = `SELECT SUM(remaining) as total_remaining 
                         FROM sales 
                         WHERE is_credit = 1 AND remaining > 0`;
            const params = [];
            if (startDate && endDate) {
                query += ` AND date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` AND date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` AND date <= ?`;
                params.push(endDate);
            }
            console.debug('SalesDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const totalRemaining = result[0].values[0][0] || 0;
            console.log('SalesDB.js: getTotalRemaining result:', totalRemaining);
            return totalRemaining;
        } catch (error) {
            console.error('SalesDB.js: Error calculating total remaining:', error.message, error.stack);
            throw new Error(`Failed calculated total remaining: ${error.message}`);
        }
    }

    /**
     * Retrieves all sales with optional date range filtering, adjusted profit calculation.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<Array<Object>>} Array of sales with client names, calculated profit, total discount, delivery price, and labor cost.
     */
    async getAllSales(startDate = '', endDate = '') {
        console.log('SalesDB.js: getAllSales called with:', { startDate, endDate });
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getAllSales');
            
            let Ascending
            let query = `
                SELECT
                    s.sale_id, s.date, s.subtotal, s.sale_discount_amount, s.delivery_price, s.labor_cost, s.total, s.paid, s.remaining, s.is_credit,
                    c.name as client_name,
                    (COALESCE(SUM(si.quantity * si.unit_price), 0)
                        - COALESCE(SUM(si.quantity * p.purchase_price), 0)
                        + s.delivery_price) as profit,
                    (s.sale_discount_amount + COALESCE(SUM(si.discount_amount), 0)) as total_discount
                FROM sales s
                LEFT JOIN clients c ON s.client_id = c.client_id
                LEFT JOIN sale_items si ON s.sale_id = si.sale_id
                LEFT JOIN products p ON si.product_id = p.product_id
            `;
            
            const params = [];
            const conditions = [];

            if (startDate) {
                conditions.push("s.date >= ?");
                params.push(startDate);
            }
            if (endDate) {
                conditions.push("s.date <= ?");
                params.push(endDate);
            }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(" AND ");
            }

            query += " GROUP BY s.sale_id ORDER BY s.sale_id DESC;";
            
            console.debug('SalesDB.js: Executing query:', query, 'with params:', params);
            
            const stmt = db.prepare(query, params);
            const sales = [];
            while (stmt.step()) {
                sales.push(stmt.getAsObject());
            }
            stmt.free();
            
            console.log('SalesDB.js: getAllSales retrieved:', sales.length, 'sales');
            return sales;
        } catch (error) {
            console.error('SalesDB.js: Error in getAllSales:', error.message, error.stack);
            throw new Error(`Failed to fetch sales: ${error.message}`);
        }
    }

    /**
     * Updates an existing sale in the database.
     * @param {number} sale_id - The ID of the sale to update.
     * @param {Object} sale - Sale details {client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit}.
     * @throws {Error} If input is invalid or database error occurs.
     */
    async updateSale(sale_id, sale) {
        console.log('SalesDB.js: updateSale called with:', { sale_id, sale });
        const { client_id, date, subtotal, sale_discount_amount = 0, delivery_price = 0, labor_cost = 0, total, paid, remaining, is_credit } = sale;
        if (!Number.isInteger(sale_id) || sale_id <= 0 ||
            !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(subtotal) || subtotal < 0 ||
            !Number.isFinite(sale_discount_amount) || sale_discount_amount < 0 ||
            !Number.isFinite(delivery_price) || delivery_price < 0 ||
            !Number.isFinite(labor_cost) || labor_cost < 0 ||
            !Number.isFinite(total) || total < 0 ||
            !Number.isFinite(paid) || paid < 0 ||
            !Number.isFinite(remaining) || remaining < 0) {
            console.error('SalesDB.js: Invalid sale data:', { sale_id, client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit });
            throw new Error('Invalid sale data provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for updateSale');
            if (client_id) {
                const clientStmt = db.prepare('SELECT 1 FROM clients WHERE client_id = ?;', [client_id]);
                if (!clientStmt.step()) {
                    clientStmt.free();
                    throw new Error(`Client with ID ${client_id} not found.`);
                }
                clientStmt.free();
            }
            const params = [client_id || null, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit ? 1 : 0, sale_id];
            const stmt = db.prepare(
                `UPDATE sales 
                 SET client_id = ?, date = ?, subtotal = ?, sale_discount_amount = ?, delivery_price = ?, labor_cost = ?, total = ?, paid = ?, remaining = ?, is_credit = ?
                 WHERE sale_id = ?;`,
                params
            );
            stmt.run();
            stmt.free();
            await this.save();
            console.log('SalesDB.js: Sale updated successfully:', sale_id);
        } catch (error) {
            console.error('SalesDB.js: Error updating sale:', error.message, error.stack);
            throw new Error(`Failed to update sale ${sale_id}: ${error.message}`);
        }
    }

    /**
     * Deletes a sale and restocks associated products.
     * @param {number} sale_id - The ID of the sale to delete.
     * @throws {Error} If sale_id is invalid or database error occurs.
     */
    async deleteSale(sale_id) {
        console.log('SalesDB.js: deleteSale called with sale_id:', sale_id);
        if (!Number.isInteger(sale_id) || sale_id <= 0) {
            console.error('SalesDB.js: Invalid sale_id:', sale_id);
            throw new Error('Invalid sale_id provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for deleteSale');
            db.run('BEGIN TRANSACTION;');
            try {
                // Step 1: Retrieve sale items to restock products
                const itemsStmt = db.prepare(
                    `SELECT product_id, quantity 
                     FROM sale_items 
                     WHERE sale_id = ?;`,
                    [sale_id]
                );
                const itemsToRestock = [];
                while (itemsStmt.step()) {
                    itemsToRestock.push(itemsStmt.getAsObject());
                }
                itemsStmt.free();

                // Step 2: Restock products
                for (const item of itemsToRestock) {
                    console.debug(`SalesDB.js: Restocking product_id ${item.product_id} with quantity ${item.quantity}`);
                    db.run(
                        `UPDATE products 
                         SET stock_quantity = stock_quantity + ? 
                         WHERE product_id = ?;`,
                        [item.quantity, item.product_id]
                    );
                }

                // Step 3: Delete sale items
                console.debug(`SalesDB.js: Deleting sale items for sale_id: ${sale_id}`);
                db.run(`DELETE FROM sale_items WHERE sale_id = ?;`, [sale_id]);

                // Step 4: Delete the sale itself
                console.debug(`SalesDB.js: Deleting sale record for sale_id: ${sale_id}`);
                db.run(`DELETE FROM sales WHERE sale_id = ?;`, [sale_id]);

                db.run('COMMIT;');
                console.log(`SalesDB.js: Successfully deleted sale ${sale_id} and restocked products`);
                await this.save();
                console.debug('SalesDB.js: Database saved after deleting sale');
            } catch (error) {
                db.run('ROLLBACK;');
                console.error('SalesDB.js: Error during deleteSale transaction:', error.message, error.stack);
                throw error;
            }
        } catch (error) {
            console.error('SalesDB.js: Error deleting sale:', error.message, error.stack);
            throw new Error(`Failed to delete sale ${sale_id}: ${error.message}`);
        }
    }

    /**
     * Retrieves a sale by its ID.
     * @param {number} sale_id - The ID of the sale to retrieve.
     * @returns {Promise<Object|null>} Sale object or null if not found.
     * @throws {Error} If sale_id is invalid or database error occurs.
     */
    async getSaleById(sale_id) {
        console.log('SalesDB.js: getSaleById called with sale_id:', sale_id);
        if (!Number.isInteger(sale_id) || sale_id <= 0) {
            console.error('SalesDB.js: Invalid sale_id:', sale_id);
            throw new Error('Invalid sale_id provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getSaleById');
            const stmt = db.prepare(
                `SELECT s.*, c.name as client_name 
                 FROM sales s 
                 LEFT JOIN clients c ON s.client_id = c.client_id 
                 WHERE s.sale_id = ?;`,
                [sale_id]
            );
            console.debug('SalesDB.js: Executing query for sale_id:', sale_id);
            let sale = null;
            if (stmt.step()) {
                sale = stmt.getAsObject();
                console.debug('SalesDB.js: Sale retrieved:', sale);
            } else {
                console.debug('SalesDB.js: No sale found for sale_id:', sale_id);
            }
            stmt.free();
            console.log('SalesDB.js: getSaleById result:', sale || 'null');
            return sale;
        } catch (error) {
            console.error('SalesDB.js: Error in getSaleById:', error.message, error.stack);
            throw new Error(`Failed to fetch sale ${sale_id}: ${error.message}`);
        }
    }

    /**
     * Retrieves all credit sales with remaining balance.
     * @returns {Promise<Array<Object>>} Array of credit sales with client names.
     * @throws {Error} If database error occurs.
     */
    async getCreditSales() {
        console.log('SalesDB.js: getCreditSales called');
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getCreditSales');
            const stmt = db.prepare(
                `SELECT s.*, c.name as client_name 
                 FROM sales s 
                 LEFT JOIN clients c ON s.client_id = c.client_id 
                 WHERE s.is_credit = 1 AND s.remaining > 0 
                 ORDER BY s.date DESC;`
            );
            console.debug('SalesDB.js: Executing query for credit sales');
            const sales = [];
            while (stmt.step()) {
                const sale = stmt.getAsObject();
                sales.push(sale);
            }
            stmt.free();
            console.log('SalesDB.js: getCreditSales retrieved:', sales.length, 'credit sales');
            console.debug('SalesDB.js: Credit sales data:', sales);
            return sales;
        } catch (error) {
            console.error('SalesDB.js: Error in getCreditSales:', error.message, error.stack);
            throw new Error(`Failed to fetch credit sales: ${error.message}`);
        }
    }

    /**
     * Retrieves the total number of sales.
     * @returns {Promise<number>} Total number of sales.
     * @throws {Error} If database error occurs.
     */
    async getTotalSalesCount() {
        console.log('SalesDB.js: getTotalSalesCount called');
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getTotalSalesCount');
            const result = db.exec('SELECT COUNT(*) FROM sales;');
            const count = result[0].values[0][0] || 0;
            console.log('SalesDB.js: getTotalSalesCount result:', count);
            return count;
        } catch (error) {
            console.error('SalesDB.js: Error in getTotalSalesCount:', error.message, error.stack);
            throw new Error(`Failed to fetch total sales count: ${error.message}`);
        }
    }

    /**
     * Calculates the total sales amount within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<number>} Total sales amount.
     * @throws {Error} If date format is invalid or database error occurs.
     */
    async getTotalSalesAmount(startDate = '', endDate = '') {
        console.log('SalesDB.js: getTotalSalesAmount called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SalesDB.js: Invalid date format detected:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getTotalSalesAmount');
            let query = `SELECT SUM(total) AS total_amount FROM sales`;
            const params = [];
            if (startDate && endDate) {
                query += ` WHERE date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` WHERE date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` WHERE date <= ?`;
                params.push(endDate);
            }
            console.debug('SalesDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const total = result[0].values[0][0] || 0;
            console.log('SalesDB.js: getTotalSalesAmount result:', total);
            return total;
        } catch (error) {
            console.error('SalesDB.js: Error in getTotalSalesAmount:', error.message, error.stack);
            throw new Error(`Failed to calculate total sales amount: ${error.message}`);
        }
    }

    /**
     * Retrieves all sales for a specific client.
     * @param {number} client_id - The ID of the client.
     * @returns {Promise<Array<Object>>} Array of sales for the client with client name.
     * @throws {Error} If client_id is invalid or database error occurs.
     */
    async getSalesByClient(client_id) {
        console.log('SalesDB.js: getSalesByClient called with client_id:', client_id);
        if (!Number.isInteger(client_id) || client_id <= 0) {
            console.error('SalesDB.js: Invalid client_id:', client_id);
            throw new Error('Invalid client_id provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getSalesByClient');
            const stmt = db.prepare(
                `SELECT s.*, c.name as client_name 
                 FROM sales s 
                 LEFT JOIN clients c ON s.client_id = c.client_id 
                 WHERE s.client_id = ? 
                 ORDER BY s.date DESC;`,
                [client_id]
            );
            console.debug('SalesDB.js: Executing query for client_id:', client_id);
            const sales = [];
            while (stmt.step()) {
                const sale = stmt.getAsObject();
                sales.push(sale);
            }
            stmt.free();
            console.log('SalesDB.js: getSalesByClient retrieved:', sales.length, 'sales for client_id:', client_id);
            console.debug('SalesDB.js: Sales data for client:', sales);
            return sales;
        } catch (error) {
            console.error('SalesDB.js: Error in getSalesByClient:', error.message, error.stack);
            throw new Error(`Failed to fetch sales for client ${client_id}: ${error.message}`);
        }
    }

    /**
     * Adds multiple sales to the database in a single transaction.
     * @param {Array<Object>} sales - Array of sale objects {client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit}.
     * @returns {Promise<Array<number>>} Array of inserted sale IDs.
     * @throws {Error} If input is invalid or database error occurs.
     */
    async addBulkSales(sales) {
        console.log('SalesDB.js: addBulkSales called with:', sales.length, 'sales');
        console.debug('SalesDB.js: Sales data:', sales);
        if (!Array.isArray(sales) || sales.length === 0) {
            console.error('SalesDB.js: Invalid sales input: must be a non-empty array');
            throw new Error('Sales must be a non-empty array.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for addBulkSales');
            const insertedIds = [];
            db.run('BEGIN TRANSACTION;');
            console.debug('SalesDB.js: Transaction started for addBulkSales');
            try {
                for (const sale of sales) {
                    const { client_id, date, subtotal, sale_discount_amount = 0, delivery_price = 0, labor_cost = 0, total, paid, remaining, is_credit } = sale;
                    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                        !Number.isFinite(subtotal) || subtotal < 0 ||
                        !Number.isFinite(sale_discount_amount) || sale_discount_amount < 0 ||
                        !Number.isFinite(delivery_price) || delivery_price < 0 ||
                        !Number.isFinite(labor_cost) || labor_cost < 0 ||
                        !Number.isFinite(total) || total < 0 ||
                        !Number.isFinite(paid) || paid < 0 ||
                        !Number.isFinite(remaining) || remaining < 0) {
                        console.error('SalesDB.js: Invalid sale data in bulk insert:', { client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit });
                        throw new Error('Invalid sale data in bulk insert.');
                    }
                    const params = [client_id || null, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit ? 1 : 0];
                    const stmt = db.prepare(
                        `INSERT INTO sales (client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                        params
                    );
                    console.debug('SalesDB.js: Executing insert query with params:', params);
                    stmt.run();
                    const sale_id = db.exec('SELECT last_insert_rowid() AS id;')[0].values[0][0];
                    stmt.free();
                    insertedIds.push(sale_id);
                    console.debug('SalesDB.js: Sale added with ID:', sale_id);
                }
                db.run('COMMIT;');
                console.debug('SalesDB.js: Transaction committed for addBulkSales');
                await this.save();
                console.debug('SalesDB.js: Database saved after adding bulk sales');
                console.log('SalesDB.js: addBulkSales completed with IDs:', insertedIds);
                return insertedIds;
            } catch (error) {
                console.error('SalesDB.js: Error during addBulkSales transaction:', error.message, error.stack);
                db.run('ROLLBACK;');
                console.debug('SalesDB.js: Transaction rolled back for addBulkSales');
                throw error;
            }
        } catch (error) {
            console.error('SalesDB.js: Error in addBulkSales:', error.message, error.stack);
            throw new Error(`Failed to add bulk sales: ${error.message}`);
        }
    }

    /**
     * Calculates the total delivery price within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<number>} Total delivery price.
     * @throws {Error} If date format is invalid or database error occurs.
     */
    async getTotalDeliveryPrice(startDate = '', endDate = '') {
        console.log('SalesDB.js: getTotalDeliveryPrice called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SalesDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getTotalDeliveryPrice');
            let query = `SELECT SUM(delivery_price) as total_delivery FROM sales`;
            const params = [];
            if (startDate && endDate) {
                query += ` WHERE date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` WHERE date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` WHERE date <= ?`;
                params.push(endDate);
            }
            console.debug('SalesDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const totalDelivery = result[0].values[0][0] || 0;
            console.log('SalesDB.js: getTotalDeliveryPrice result:', totalDelivery);
            return totalDelivery;
        } catch (error) {
            console.error('SalesDB.js: Error calculating total delivery price:', error.message, error.stack);
            throw new Error(`Failed to calculate total delivery price: ${error.message}`);
        }
    }

    /**
     * Calculates the total labor cost within an optional date range.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<number>} Total labor cost.
     * @throws {Error} If date format is invalid or database error occurs.
     */
    async getTotalLaborCost(startDate = '', endDate = '') {
        console.log('SalesDB.js: getTotalLaborCost called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SalesDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getTotalLaborCost');
            let query = `SELECT SUM(labor_cost) as total_labor FROM sales`;
            const params = [];
            if (startDate && endDate) {
                query += ` WHERE date BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` WHERE date >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` WHERE date <= ?`;
                params.push(endDate);
            }
            console.debug('SalesDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const totalLabor = result[0].values[0][0] || 0;
            console.log('SalesDB.js: getTotalLaborCost result:', totalLabor);
            return totalLabor;
        } catch (error) {
            console.error('SalesDB.js: Error calculating total labor cost:', error.message, error.stack);
            throw new Error(`Failed to calculate total labor cost: ${error.message}`);
        }
    }

    /**
     * Retrieves sales with filters and pagination.
     * @param {Object} filters - Filters { startDate, endDate, clientSearch, saleType }.
     * @param {number} page - Page number (1-based).
     * @param {number} pageSize - Number of sales per page.
     * @returns {Promise<{ sales: Array<Object>, total: number }>} Paginated sales and total count.
     * @throws {Error} If filters are invalid or database error occurs.
     */
    async getSalesWithFilters(filters, page, pageSize) {
        console.log('SalesDB.js: getSalesWithFilters called with:', { filters, page, pageSize });
        const { startDate = '', endDate = '', clientSearch = '', saleType = 'all' } = filters;

        // Validate inputs
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('SalesDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('Invalid date format. Use YYYY-MM-DD.');
        }
        if (!Number.isInteger(page) || page < 1) {
            console.error('SalesDB.js: Invalid page number:', page);
            throw new Error('Invalid page number provided.');
        }
        if (!Number.isInteger(pageSize) || pageSize < 1) {
            console.error('SalesDB.js: Invalid page size:', pageSize);
            throw new Error('Invalid page size provided.');
        }

        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getSalesWithFilters');

            // Build query conditions
            const conditions = [];
            const params = [];

            if (startDate) {
                conditions.push('s.date >= ?');
                params.push(startDate);
            }
            if (endDate) {
                conditions.push('s.date <= ?');
                params.push(endDate);
            }
            if (clientSearch) {
                conditions.push('c.name LIKE ?');
                params.push(`%${clientSearch}%`);
            }
            if (saleType === 'credit') {
                conditions.push('s.is_credit = 1');
            } else if (saleType === 'paid') {
                conditions.push('s.is_credit = 0');
            }

            // Base query for sales
            let query = `
                SELECT
                    s.sale_id, s.date, s.subtotal, s.sale_discount_amount, s.delivery_price, s.labor_cost, s.total, s.paid, s.remaining, s.is_credit,
                    c.name as client_name,
                    (s.total - COALESCE(SUM(si.quantity * p.purchase_price), 0) + s.delivery_price + s.labor_cost) as profit,
                    (s.sale_discount_amount + COALESCE(SUM(si.discount_amount), 0)) as total_discount
                FROM sales s
                LEFT JOIN clients c ON s.client_id = c.client_id
                LEFT JOIN sale_items si ON s.sale_id = si.sale_id
                LEFT JOIN products p ON si.product_id = p.product_id
            `;

            // Count query for total records
            let countQuery = `
                SELECT COUNT(DISTINCT s.sale_id) as total
                FROM sales s
                LEFT JOIN clients c ON s.client_id = c.client_id
                LEFT JOIN sale_items si ON s.sale_id = si.sale_id
            `;

            // Apply conditions
            if (conditions.length > 0) {
                const whereClause = ' WHERE ' + conditions.join(' AND ');
                query += whereClause;
                countQuery += whereClause;
            }

            // Group and order for main query
            query += `
                GROUP BY s.sale_id
                ORDER BY s.sale_id DESC
                LIMIT ? OFFSET ?;
            `;
            params.push(pageSize, (page - 1) * pageSize);

            console.debug('SalesDB.js: Executing query:', query, 'with params:', params);
            console.debug('SalesDB.js: Executing count query:', countQuery, 'with params:', params.slice(0, params.length - 2));

            // Execute main query
            const stmt = db.prepare(query, params);
            const sales = [];
            while (stmt.step()) {
                sales.push(stmt.getAsObject());
            }
            stmt.free();

            // Execute count query
            const countStmt = db.prepare(countQuery, params.slice(0, params.length - 2));
            let total = 0;
            if (countStmt.step()) {
                total = countStmt.getAsObject().total;
            }
            countStmt.free();

            console.log('SalesDB.js: getSalesWithFilters retrieved:', sales.length, 'sales, total:', total);
            return { sales, total };
        } catch (error) {
            console.error('SalesDB.js: Error in getSalesWithFilters:', error.message, error.stack);
            throw new Error(`Failed to fetch filtered sales: ${error.message}`);
        }
    }
}

export default SalesDB;