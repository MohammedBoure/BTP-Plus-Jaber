import Database from './Database.js';

class ClientsDB extends Database {

    
    async getAllClients(searchTerm = '') {
        const db = await this.getDB();
        const query = searchTerm
            ? `SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ? ORDER BY name;`
            : `SELECT * FROM clients ORDER BY name;`;
        const stmt = db.prepare(query, searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`] : []);
        const clients = [];
        while (stmt.step()) {
            clients.push(stmt.getAsObject());
        }
        stmt.free();
        return clients;
    }

    async addClient(client) {
        const { name, phone, address, is_regular, notes } = client;
        const db = await this.getDB();
        db.run(
            `INSERT INTO clients (client_id, name, phone, address, is_regular, notes) 
             VALUES (?, ?, ?, ?, ?, ?);`,
            [Date.now(), name, phone || null, address || null, is_regular ? 1 : 0, notes || null]
        );
        await this.save();
    }

    async updateClient(client_id, client) {
        const { name, phone, address, is_regular, notes } = client;
        const db = await this.getDB();
        db.run(
            `UPDATE clients 
             SET name = ?, phone = ?, address = ?, is_regular = ?, notes = ? 
             WHERE client_id = ?;`,
            [name, phone || null, address || null, is_regular ? 1 : 0, notes || null, client_id]
        );
        await this.save();
    }

    async deleteClient(client_id) {
        const db = await this.getDB();
        db.run(`DELETE FROM clients WHERE client_id = ?;`, [client_id]);
        await this.save();
    }

    async getClientById(client_id) {
        const db = await this.getDB();
        const stmt = db.prepare(`SELECT * FROM clients WHERE client_id = ?;`, [client_id]);
        let client = null;
        if (stmt.step()) {
            client = stmt.getAsObject();
        }
        stmt.free();
        return client;
    }

    async getRegularClients() {
        const db = await this.getDB();
        const stmt = db.prepare(`SELECT * FROM clients WHERE is_regular = 1 ORDER BY name;`);
        const clients = [];
        while (stmt.step()) {
            clients.push(stmt.getAsObject());
        }
        stmt.free();
        return clients;
    }

    async getTotalClientsCount() {
        const db = await this.getDB();
        const result = db.exec("SELECT COUNT(*) FROM clients;");
        if (result.length > 0 && result[0].values && result[0].values.length > 0) {
            return result[0].values[0][0];
        }
        return 0;
    }

    async getClientsWithCredit() {
        const db = await this.getDB();
        const stmt = db.prepare(`
            SELECT c.client_id, c.name, c.phone, c.address, c.is_regular, c.notes, SUM(s.remaining) as total_remaining
            FROM clients c
            JOIN sales s ON c.client_id = s.client_id
            WHERE s.is_credit = 1 AND s.remaining > 0
            GROUP BY c.client_id
            ORDER BY total_remaining DESC, c.name;
        `);
        const clients = [];
        while (stmt.step()) {
            clients.push(stmt.getAsObject());
        }
        stmt.free();
        return clients;
    }

    async getClientPurchaseHistory(clientId) {
        console.log('ClientsDB.js: getClientPurchaseHistory called with client_id:', clientId);
        if (!Number.isInteger(clientId) || clientId <= 0) {
            console.error('ClientsDB.js: Invalid client_id:', clientId);
            throw new Error('Invalid client_id provided.');
        }
        try {
            const db = await this.getDB();
            console.debug('ClientsDB.js: Database connection established for getClientPurchaseHistory');
            const query = `
                SELECT 
                    sale_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit
                FROM sales 
                WHERE client_id = ? 
                ORDER BY date DESC;
            `;
            const params = [clientId];
            console.debug('ClientsDB.js: Executing query:', query, 'with params:', params);
            const stmt = db.prepare(query, params);
            const history = [];
            while (stmt.step()) {
                history.push(stmt.getAsObject());
            }
            stmt.free();
            console.log('ClientsDB.js: Retrieved purchase history with', history.length, 'sales');
            return history;
        } catch (error) {
            console.error('ClientsDB.js: Error fetching client purchase history:', error.message, error.stack);
            throw new Error(`Failed to fetch purchase history for client ${clientId}: ${error.message}`);
        }
    }

    async getClientPayments(client_id) {
        const db = await this.getDB();
        const stmt = db.prepare(`
            SELECT p.payment_id, p.date, p.amount, p.notes
            FROM payments p
            WHERE p.client_id = ?
            ORDER BY p.date DESC;
        `, [client_id]);
        const payments = [];
        while (stmt.step()) {
            payments.push(stmt.getAsObject());
        }
        stmt.free();
        return payments;
    }

    async getTopSpendingClients(limit = 5) {
        const db = await this.getDB();
        const stmt = db.prepare(`
            SELECT c.client_id, c.name, c.phone, c.is_regular, SUM(s.total) as total_spent
            FROM clients c
            JOIN sales s ON c.client_id = s.client_id
            GROUP BY c.client_id
            ORDER BY total_spent DESC, c.name
            LIMIT ?;
        `, [limit]);
        const clients = [];
        while (stmt.step()) {
            clients.push(stmt.getAsObject());
        }
        stmt.free();
        return clients;
    }

    async updateClientRegularStatus(client_id, is_regular) {
        const db = await this.getDB();
        db.run(
            `UPDATE clients SET is_regular = ? WHERE client_id = ?;`,
            [is_regular ? 1 : 0, client_id]
        );
        await this.save();
    }

    /**
     * Settles all outstanding debts for a client by creating a new payment.
     * @param {number} client_id - The ID of the client.
     * @param {PaymentsDB} paymentsDB - An instance of PaymentsDB.
     * @returns {Promise<void>}
     */
    async settleClientDebts(client_id, paymentsDB) {
        console.log('ClientsDB.js: settleClientDebts called for client_id:', client_id);
        const id = Number(client_id);
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('Invalid client_id provided.');
        }

        const db = await this.getDB();
        try {
            // Step 1: Calculate the total remaining amount for the client.
            const totalRemainingStmt = db.prepare(
                `SELECT SUM(remaining) as total_debt 
                 FROM sales 
                 WHERE client_id = ? AND is_credit = 1 AND remaining > 0;`,
                [id]
            );

            let totalDebt = 0;
            if (totalRemainingStmt.step()) {
                totalDebt = totalRemainingStmt.getAsObject().total_debt || 0;
            }
            totalRemainingStmt.free();

            if (totalDebt <= 0) {
                console.log(`ClientsDB.js: Client ${id} has no outstanding debt to settle.`);
                // لا يوجد دين لتسويته، يمكننا ببساطة الخروج.
                return;
            }

            console.log(`ClientsDB.js: Total debt for client ${id} is ${totalDebt}. Creating settlement payment.`);

            // Step 2: Create a new payment object for the settlement.
            const settlementPayment = {
                client_id: id,
                date: new Date().toISOString().split('T')[0], // Use today's date
                amount: totalDebt,
                notes: 'تسوية كاملة للديون'
            };

            // Step 3: Add the payment using PaymentsDB.
            // addPayment will automatically handle updating the sales records.
            await paymentsDB.addPayment(settlementPayment);

            console.log(`ClientsDB.js: Successfully created settlement payment for client ${id}.`);

        } catch (error) {
            console.error(`ClientsDB.js: Error settling debts for client ${id}:`, error.message, error.stack);
            throw error; // Re-throw the error to be caught by the UI
        }
    }
}

export default ClientsDB;