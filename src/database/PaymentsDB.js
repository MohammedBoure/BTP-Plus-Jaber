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
        const { client_id, date, amount, notes, sale_ids } = payment;
        const db = await this.getDB();
        db.run('BEGIN TRANSACTION;');
        try {
            // Validate inputs
            if (!Number.isInteger(client_id) || client_id <= 0) {
                throw new Error('معرف العميل غير صالح.');
            }
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw new Error('صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD.');
            }
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new Error('مبلغ الدفعة غير صالح.');
            }

            // Retrieve credit sales to apply payment
            let sales = [];
            if (sale_ids && Array.isArray(sale_ids) && sale_ids.length > 0) {
                // If specific sale IDs are provided, fetch only those sales
                const placeholders = sale_ids.map(() => '?').join(',');
                const query = `
                    SELECT sale_id, remaining 
                    FROM sales 
                    WHERE client_id = ? AND is_credit = 1 AND remaining > 0 AND sale_id IN (${placeholders})
                    ORDER BY date ASC;
                `;
                const params = [client_id, ...sale_ids];
                const stmt = db.prepare(query, params);
                while (stmt.step()) {
                    sales.push(stmt.getAsObject());
                }
                stmt.free();
            } else {
                // Fallback to existing logic: fetch all credit sales with remaining balance
                const stmt = db.prepare(`
                    SELECT sale_id, remaining 
                    FROM sales 
                    WHERE client_id = ? AND is_credit = 1 AND remaining > 0 
                    ORDER BY date ASC;
                `, [client_id]);
                while (stmt.step()) {
                    sales.push(stmt.getAsObject());
                }
                stmt.free();
            }

            // Validate that sales exist if specific IDs were provided
            if (sale_ids && sale_ids.length > 0 && sales.length === 0) {
                throw new Error('لم يتم العثور على مبيعات ائتمانية صالحة للمعرفات المحددة.');
            }

            // Apply payment to selected or oldest sales
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

            // Check if any payment amount remains unallocated
            if (remainingAmount > 0 && sale_ids && sale_ids.length > 0) {
                console.warn(`PaymentsDB.js: ${remainingAmount} من مبلغ الدفعة لم يتم تطبيقه على المبيعات المحددة.`);
            }

            // Insert payment record
            const payment_id = Date.now();
            db.run(
                `INSERT INTO payments (payment_id, client_id, date, amount, notes) 
                VALUES (?, ?, ?, ?, ?);`,
                [payment_id, client_id, date, amount, notes || null]
            );

            db.run('COMMIT;');
            await this.save();
            return payment_id;
        } catch (error) {
            db.run('ROLLBACK;');
            console.error('Error adding payment:', error);
            throw new Error(`فشل في إضافة الدفعة: ${error.message}`);
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
            throw new Error(`فشل في تحديث الدفعة: ${error.message}`);
        }
    }

    async deletePayment(payment_id) {
        console.log('PaymentsDB.js: deletePayment called with payment_id:', payment_id);
        const parsedPaymentId = Number(payment_id);
        if (!Number.isFinite(parsedPaymentId)) {
            console.error('PaymentsDB.js: Invalid payment_id:', payment_id);
            throw new Error('معرف الدفعة غير صالح.');
        }

        const db = await this.getDB();
        db.run('BEGIN TRANSACTION;');
        console.debug('PaymentsDB.js: Transaction started for deleting payment:', parsedPaymentId);

        try {
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
                throw new Error(`الدفعة بمعرف ${parsedPaymentId} غير موجودة.`);
            }

            console.debug('PaymentsDB.js: Payment to delete:', payment);
            const { amount, client_id } = payment;
            let remainingAmount = amount;

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

            console.debug('PaymentsDB.js: Deleting payment record for payment_id:', parsedPaymentId);
            const deleteStmt = db.prepare(`DELETE FROM payments WHERE payment_id = ?;`, [parsedPaymentId]);
            const changes = deleteStmt.run();
            deleteStmt.free();

            if (changes === 0) {
                console.error('PaymentsDB.js: No payment deleted, possible issue with payment_id:', parsedPaymentId);
                throw new Error(`لم يتم حذف الدفعة بمعرف ${parsedPaymentId}.`);
            }

            db.run('COMMIT;');
            console.log('PaymentsDB.js: Successfully deleted payment and reversed effects for payment_id:', parsedPaymentId);

            await this.save();
            console.debug('PaymentsDB.js: Database saved after deleting payment');
        } catch (error) {
            console.error('PaymentsDB.js: Error during deletePayment transaction:', error.message, error.stack);
            db.run('ROLLBACK;');
            console.debug('PaymentsDB.js: Transaction rolled back for deletePayment');
            throw new Error(`فشل في حذف الدفعة ${parsedPaymentId}: ${error.message}`);
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
        console.log('PaymentsDB.js: getTotalPaymentsAmount called with:', { startDate, endDate });
        const db = await this.getDB();
        let query = `SELECT SUM(amount) AS total_amount FROM payments`;
        const params = [];
        if (startDate && endDate) {
            query += ` WHERE DATE(date) BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ` WHERE DATE(date) >= ?`;
            params.push(startDate);
        } else if (endDate) {
            query += ` WHERE DATE(date) <= ?`;
            params.push(endDate);
        }
        console.log('PaymentsDB.js: Executing query:', query, 'with params:', params);
        const result = db.exec(query, params);
        const total = result[0].values[0][0] || 0;
        console.log('PaymentsDB.js: getTotalPaymentsAmount result:', total);
        return total;
    }

    async getTotalPaidCredit(startDate = '', endDate = '') {
        console.log('PaymentsDB.js: getTotalPaidCredit called with:', { startDate, endDate });
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            console.error('PaymentsDB.js: Invalid date format:', { startDate, endDate });
            throw new Error('صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD.');
        }
        try {
            const db = await this.getDB();
            let query = `SELECT SUM(amount) AS total_amount FROM payments`;
            const params = [];
            if (startDate && endDate) {
                query += ` WHERE DATE(date) BETWEEN ? AND ?`;
                params.push(startDate, endDate);
            } else if (startDate) {
                query += ` WHERE DATE(date) >= ?`;
                params.push(startDate);
            } else if (endDate) {
                query += ` WHERE DATE(date) <= ?`;
                params.push(endDate);
            }
            console.log('PaymentsDB.js: Executing query:', query, 'with params:', params);
            const result = db.exec(query, params);
            const total = result[0].values[0][0] || 0;
            console.log('PaymentsDB.js: getTotalPaidCredit result:', total);
            return total;
        } catch (error) {
            console.error('PaymentsDB.js: Error in getTotalPaidCredit:', error.message, error.stack);
            throw new Error(`فشل في حساب إجمالي الدفعات الائتمانية: ${error.message}`);
        }
    }
}

export default PaymentsDB;