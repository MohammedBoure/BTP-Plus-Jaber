import PaymentsDB from '../database/PaymentsDB.js';

const paymentsDB = new PaymentsDB();


export async function getAllPayments(startDate = '', endDate = '') {
    try {
        const payments = await paymentsDB.getAllPayments(startDate, endDate);
        return payments;
    } catch (error) {
        console.error('Error loading payments:', error);
        return [];
    }
}

export async function getPaymentById(paymentId) {
    try {
        const payment = await paymentsDB.getPaymentById(paymentId);
        return payment;
    } catch (error) {
        console.error('Error loading payment:', error);
        return null;
    }
}

export async function savePayment(payment, paymentId = null) {
    try {
        if (paymentId) {
            await paymentsDB.updatePayment(paymentId, payment);
        } else {
            await paymentsDB.addPayment(payment);
        }
    } catch (error) {
        console.error('Error saving payment:', error);
        throw error;
    }
}

export async function deletePayment(paymentId) {
    try {
        await paymentsDB.deletePayment(paymentId);
    } catch (error) {
        console.error('Error deleting payment:', error);
        throw error;
    }
}