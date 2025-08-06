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

    async getClientPurchaseHistory(client_id) {
        const db = await this.getDB();
        const stmt = db.prepare(`
            SELECT s.sale_id, s.date, s.total, s.paid, s.remaining, s.is_credit
            FROM sales s
            WHERE s.client_id = ?
            ORDER BY s.date DESC;
        `, [client_id]);
        const sales = [];
        while (stmt.step()) {
            sales.push(stmt.getAsObject());
        }
        stmt.free();
        return sales;
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
}

export default ClientsDB;