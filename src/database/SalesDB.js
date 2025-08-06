import Database from './Database.js';

/**
 * Manages sales in the database, extending the base Database class.
 */
class SalesDB extends Database {
    /**
     * Adds a new sale to the database.
     * @param {Object} sale - Sale details {client_id, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit}.
     * @returns {Promise<number>} The ID of the newly inserted sale.
     * @throws {Error} If input is invalid or database error occurs.
     */
    async addSale(sale) {
        console.log('SalesDB.js: addSale called with:', JSON.stringify(sale, null, 2));
        const { client_id, date, subtotal, sale_discount_amount = 0, total, paid, remaining, is_credit } = sale;
        
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
            const params = [client_id || null, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit ? 1 : 0];
            console.log('SalesDB.js: Executing insert query with params:', params);
            const stmt = db.prepare(
                `INSERT INTO sales (client_id, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
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
            throw new Error(`Failed to calculate total remaining: ${error.message}`);
        }
    }

    /**
     * Retrieves all sales with optional date range filtering.
     * @param {string} [startDate] - Start date in YYYY-MM-DD format.
     * @param {string} [endDate] - End date in YYYY-MM-DD format.
     * @returns {Promise<Array<Object>>} Array of sales with client names and calculated profit and total discount.
     */
    async getAllSales(startDate = '', endDate = '') {
        console.log('SalesDB.js: getAllSales called with:', { startDate, endDate });
        try {
            const db = await this.getDB();
            console.debug('SalesDB.js: Database connection established for getAllSales');
            
            let query = `
                SELECT
                    s.sale_id, s.date, s.total, s.paid, s.remaining, s.is_credit,
                    s.sale_discount_amount,
                    c.name as client_name,
                    (s.total - COALESCE(SUM(si.quantity * p.purchase_price), 0)) as profit,
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

    async updateSale(sale_id, sale) {
        console.log('SalesDB.js: updateSale called with:', { sale_id, sale });
        const { client_id, date, subtotal, sale_discount_amount = 0, total, paid, remaining, is_credit } = sale;
        if (!Number.isInteger(sale_id) || sale_id <= 0 ||
            !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(subtotal) || subtotal < 0 ||
            !Number.isFinite(sale_discount_amount) || sale_discount_amount < 0 ||
            !Number.isFinite(total) || total < 0 ||
            !Number.isFinite(paid) || paid < 0 ||
            !Number.isFinite(remaining) || remaining < 0) {
            console.error('SalesDB.js: Invalid sale data:', { sale_id, client_id, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit });
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
            const params = [client_id || null, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit ? 1 : 0, sale_id];
            const stmt = db.prepare(
                `UPDATE sales 
                 SET client_id = ?, date = ?, subtotal = ?, sale_discount_amount = ?, total = ?, paid = ?, remaining = ?, is_credit = ?
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
                    const { client_id, date, subtotal, sale_discount_amount = 0, total, paid, remaining, is_credit } = sale;
                    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                        !Number.isFinite(subtotal) || subtotal < 0 ||
                        !Number.isFinite(sale_discount_amount) || sale_discount_amount < 0 ||
                        !Number.isFinite(total) || total < 0 ||
                        !Number.isFinite(paid) || paid < 0 ||
                        !Number.isFinite(remaining) || remaining < 0) {
                        console.error('SalesDB.js: Invalid sale data in bulk insert:', { client_id, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit });
                        throw new Error('Invalid sale data in bulk insert.');
                    }
                    const params = [client_id || null, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit ? 1 : 0];
                    const stmt = db.prepare(
                        `INSERT INTO sales (client_id, date, subtotal, sale_discount_amount, total, paid, remaining, is_credit) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
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
}

export default SalesDB;