import ClientsDB from '../database/ClientsDB.js';

document.addEventListener('DOMContentLoaded', async () => {
    const clientsDB = new ClientsDB();
    const searchInput = document.getElementById('clientSearch');
    const tableBody = document.getElementById('clientsTableBody');

    const renderClients = (clients, creditData) => {
        // Clear previous static or dynamic content
        tableBody.innerHTML = ''; 

        if (clients.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500 dark:text-gray-400">لا يوجد عملاء يطابقون البحث.</td></tr>`;
            return;
        }

        const creditMap = new Map(creditData.map(c => [c.client_id, c.total_remaining]));

        clients.forEach(client => {
            const creditBalance = creditMap.get(client.client_id) || 0;
            
            const isRegularBadge = client.is_regular 
                ? `<span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-green-900 dark:text-green-300">نعم</span>`
                : `<span class="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-gray-700 dark:text-gray-300">لا</span>`;
            
            const creditClass = creditBalance > 0 
                ? 'text-danger font-medium'
                : 'text-gray-600 dark:text-gray-400';

            // FIX: Row template updated for semantics (th), number formatting, and explicit theme classes.
            const row = `
                <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600">
                    <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                        ${client.name}
                    </th>
                    <td class="px-6 py-4 text-gray-600 dark:text-gray-400">
                        ${client.phone || '—'}
                    </td>
                    <td class="px-6 py-4">
                        ${isRegularBadge}
                    </td>
                    <td class="px-6 py-4 ${creditClass}">
                        ${creditBalance.toLocaleString()} د.ج
                    </td>
                    <td class="px-6 py-4 flex gap-4 justify-end">
                        <a href="add-client.html?id=${client.client_id}" class="font-medium text-primary hover:underline dark:text-blue-400">تعديل</a>
                        <button class="font-medium text-danger hover:underline dark:text-red-500 delete-btn" data-id="${client.client_id}">حذف</button>
                    </td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', row);
        });
    };

    const loadAndRenderClients = async () => {
        const searchTerm = searchInput.value.trim();
        try {
            const [allClients, clientsWithCredit] = await Promise.all([
                clientsDB.getAllClients(searchTerm),
                clientsDB.getClientsWithCredit()
            ]);
            renderClients(allClients, clientsWithCredit);
        } catch (error) {
            console.error('Failed to load clients:', error);
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-danger">حدث خطأ أثناء تحميل البيانات.</td></tr>`;
        }
    };

    searchInput.addEventListener('input', loadAndRenderClients);

    tableBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const clientId = e.target.dataset.id;
            if (confirm('هل أنت متأكد من رغبتك في حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء.')) {
                try {
                    const purchaseHistory = await clientsDB.getClientPurchaseHistory(clientId);
                    if (purchaseHistory.length > 0) {
                        alert('لا يمكن حذف هذا العميل لأنه مرتبط بسجلات مبيعات. يمكنك تعديل بياناته بدلاً من ذلك.');
                        return;
                    }
                    await clientsDB.deleteClient(clientId);
                    await loadAndRenderClients();
                } catch (error) {
                    console.error('Failed to delete client:', error);
                    alert('فشل حذف العميل. قد يكون مرتبطًا بسجلات أخرى.');
                }
            }
        }
    });

    // Initial load
    await loadAndRenderClients();
});