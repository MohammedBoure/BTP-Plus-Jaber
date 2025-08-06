import Database from './Database.js';

class PaymentsDB extends Database {
    async getAllPayments(startDate = '', endDate = '') {
        const db = await this.getDB();
        let query = `SELECT p.*, c.name as client_name 
                     FROM payments p 
                     JOIN clients c ON p.client_id = c.client_id`;
        const params = [];
        if (startDate && endDate) {
            query += ` WHERE p.date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ` WHERE p.date >= ?`;
            params.push(startDate);
        } else if (endDate) {
            query += ` WHERE p.date <= ?`;
            params.push(endDate);
        }
        query += ` ORDER BY p.date DESC;`;
        const stmt = db.prepare(query, params);
        const payments = [];
        while (stmt.step()) {
            payments.push(stmt.getAsObject());
        }
        stmt.free();
        return payments;
    }

    async addPayment(payment) {
        const { client_id, date, amount, notes } = payment;
        const db = await this.getDB();
        db.run('BEGIN TRANSACTION;');
        try {
            const stmt = db.prepare(`
                SELECT sale_id, remaining 
                FROM sales 
                WHERE client_id = ? AND is_credit = 1 AND remaining > 0 
                ORDER BY date ASC;
            `, [client_id]);
            const sales = [];
            while (stmt.step()) {
                sales.push(stmt.getAsObject());
            }
            stmt.free();

            let remainingAmount = amount;
            for (const sale of sales) {
                if (remainingAmount <= 0) break;
                const amountToApply = Math.min(remainingAmount, sale.remaining);
                db.run(`
                    UPDATE sales 
                    SET remaining = remaining - ?, paid = paid + ? 
                    WHERE sale_id = ?;
                `, [amountToApply, amountToApply, sale.sale_id]);
                remainingAmount -= amountToApply;
            }

            const payment_id = Date.now();
            db.run(
                `INSERT INTO payments (payment_id, client_id, date, amount, notes) 
                VALUES (?, ?, ?, ?, ?);`,
                [payment_id, client_id, date, amount, notes || null]
            );

            db.run('COMMIT;');
            await this.save();
            return payment_id; // Return the generated payment_id
        } catch (error) {
            db.run('ROLLBACK;');
            console.error('Error adding payment:', error);
            throw new Error(`Failed to add payment: ${error.message}`);
        }
    }

    async updatePayment(payment_id, payment) {
        const { client_id, date, amount, notes } = payment;
        const db = await this.getDB();

        db.run('BEGIN TRANSACTION;');
        try {
            // Retrieve old payment details
            const oldPaymentStmt = db.prepare(`
                SELECT amount, client_id 
                FROM payments 
                WHERE payment_id = ?;
            `, [payment_id]);
            let oldPayment = null;
            if (oldPaymentStmt.step()) {
                oldPayment = oldPaymentStmt.getAsObject();
            }
            oldPaymentStmt.free();

            if (!oldPayment) {
                throw new Error('الدفعة غير موجودة');
            }

            // Revert old payment effects
            const oldAmount = oldPayment.amount;
            const oldClientId = oldPayment.client_id;
            let remainingOldAmount = oldAmount;

            const oldSalesStmt = db.prepare(`
                SELECT sale_id, paid, remaining 
                FROM sales 
                WHERE client_id = ? AND is_credit = 1 AND paid > 0 
                ORDER BY date ASC;
            `, [oldClientId]);
            const oldSales = [];
            while (oldSalesStmt.step()) {
                oldSales.push(oldSalesStmt.getAsObject());
            }
            oldSalesStmt.free();

            for (const sale of oldSales) {
                if (remainingOldAmount <= 0) break;
                const amountToRevert = Math.min(remainingOldAmount, sale.paid);
                db.run(`
                    UPDATE sales 
                    SET remaining = remaining + ?, paid = paid - ? 
                    WHERE sale_id = ?;
                `, [amountToRevert, amountToRevert, sale.sale_id]);
                remainingOldAmount -= amountToRevert;
            }

            // Apply new payment effects
            let remainingNewAmount = amount;
            const newSalesStmt = db.prepare(`
                SELECT sale_id, remaining 
                FROM sales 
                WHERE client_id = ? AND is_credit = 1 AND remaining > 0 
                ORDER BY date ASC;
            `, [client_id]);
            const newSales = [];
            while (newSalesStmt.step()) {
                newSales.push(newSalesStmt.getAsObject());
            }
            newSalesStmt.free();

            for (const sale of newSales) {
                if (remainingNewAmount <= 0) break;
                const amountToApply = Math.min(remainingNewAmount, sale.remaining);
                db.run(`
                    UPDATE sales 
                    SET remaining = remaining - ?, paid = paid + ? 
                    WHERE sale_id = ?;
                `, [amountToApply, amountToApply, sale.sale_id]);
                remainingNewAmount -= amountToApply;
            }

            // Update payment record
            db.run(
                `UPDATE payments 
                 SET client_id = ?, date = ?, amount = ?, notes = ? 
                 WHERE payment_id = ?;`,
                [client_id, date, amount, notes || null, payment_id]
            );

            db.run('COMMIT;');
            await this.save();
        } catch (error) {
            db.run('ROLLBACK;');
            console.error('Error updating payment:', error);
            throw new Error(`Failed to update payment: ${error.message}`);
        }
    }

    async deletePayment(payment_id) {
        console.log('PaymentsDB.js: deletePayment called with payment_id:', payment_id);
        // Ensure payment_id is a number
        const parsedPaymentId = Number(payment_id);
        if (!Number.isFinite(parsedPaymentId)) {
            console.error('PaymentsDB.js: Invalid payment_id:', payment_id);
            throw new Error('Invalid payment_id provided.');
        }

        const db = await this.getDB();
        db.run('BEGIN TRANSACTION;');
        console.debug('PaymentsDB.js: Transaction started for deleting payment:', parsedPaymentId);

        try {
            // Step 1: Retrieve the payment details
            const paymentStmt = db.prepare(
                `SELECT amount, client_id 
                FROM payments 
                WHERE payment_id = ?;`,
                [parsedPaymentId]
            );
            let payment = null;
            if (paymentStmt.step()) {
                payment = paymentStmt.getAsObject();
            }
            paymentStmt.free();

            if (!payment) {
                console.error('PaymentsDB.js: Payment not found for payment_id:', parsedPaymentId);
                throw new Error(`Payment with ID ${parsedPaymentId} not found.`);
            }

            console.debug('PaymentsDB.js: Payment to delete:', payment);
            const { amount, client_id } = payment;
            let remainingAmount = amount;

            // Step 2: Retrieve credit sales for the client to reverse payment effects
            const salesStmt = db.prepare(
                `SELECT sale_id, paid, remaining 
                FROM sales 
                WHERE client_id = ? AND is_credit = 1 AND paid > 0 
                ORDER BY date ASC;`,
                [client_id]
            );
            const sales = [];
            while (salesStmt.step()) {
                sales.push(salesStmt.getAsObject());
            }
            salesStmt.free();
            console.debug('PaymentsDB.js: Credit sales to revert:', sales);

            // Step 3: Reverse the payment effect on credit sales
            for (const sale of sales) {
                if (remainingAmount <= 0) break;
                const amountToRevert = Math.min(remainingAmount, sale.paid);
                console.debug(`PaymentsDB.js: Reverting amount ${amountToRevert} for sale_id: ${sale.sale_id}`);
                db.run(
                    `UPDATE sales 
                    SET remaining = remaining + ?, paid = paid - ? 
                    WHERE sale_id = ?;`,
                    [amountToRevert, amountToRevert, sale.sale_id]
                );
                remainingAmount -= amountToRevert;
            }

            // Step 4: Delete the payment record
            console.debug('PaymentsDB.js: Deleting payment record for payment_id:', parsedPaymentId);
            const deleteStmt = db.prepare(`DELETE FROM payments WHERE payment_id = ?;`, [parsedPaymentId]);
            const changes = deleteStmt.run();
            deleteStmt.free();

            if (changes === 0) {
                console.error('PaymentsDB.js: No payment deleted, possible issue with payment_id:', parsedPaymentId);
                throw new Error(`No payment deleted for payment_id ${parsedPaymentId}.`);
            }

            // Step 5: Commit the transaction
            db.run('COMMIT;');
            console.log('PaymentsDB.js: Successfully deleted payment and reversed effects for payment_id:', parsedPaymentId);

            // Step 6: Save the database
            await this.save();
            console.debug('PaymentsDB.js: Database saved after deleting payment');
        } catch (error) {
            console.error('PaymentsDB.js: Error during deletePayment transaction:', error.message, error.stack);
            db.run('ROLLBACK;');
            console.debug('PaymentsDB.js: Transaction rolled back for deletePayment');
            throw new Error(`Failed to delete payment ${parsedPaymentId}: ${error.message}`);
        }
    }

    async getPaymentById(payment_id) {
        const db = await this.getDB();
        const stmt = db.prepare(
            `SELECT p.*, c.name as client_name 
             FROM payments p 
             JOIN clients c ON p.client_id = c.client_id 
             WHERE p.payment_id = ?;`,
            [payment_id]
        );
        let payment = null;
        if (stmt.step()) {
            payment = stmt.getAsObject();
        }
        stmt.free();
        return payment;
    }

    async getPaymentsByClient(client_id) {
        const db = await this.getDB();
        const stmt = db.prepare(
            `SELECT p.*, c.name as client_name 
             FROM payments p 
             JOIN clients c ON p.client_id = c.client_id 
             WHERE p.client_id = ? 
             ORDER BY p.date DESC;`,
            [client_id]
        );
        const payments = [];
        while (stmt.step()) {
            payments.push(stmt.getAsObject());
        }
        stmt.free();
        return payments;
    }

    async getTotalPaymentsAmount(startDate = '', endDate = '') {
        const db = await this.getDB();
        let query = `SELECT SUM(amount) AS total_amount FROM payments`;
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
        const result = db.exec(query, params);
        return result[0].values[0][0] || 0;
    }
}

export default PaymentsDB;