import Database from '../database/Database.js';

const db = new Database();

export async function getAllClients() {
    try {
        const database = await db.getDB();
        const stmt = database.prepare('SELECT client_id, name FROM clients ORDER BY name;');
        const clients = [];
        while (stmt.step()) {
            clients.push(stmt.getAsObject());
        }
        stmt.free();
        return clients;
    } catch (error) {
        console.error('Error loading clients:', error);
        return [];
    }
}