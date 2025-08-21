import ClientsDB from '../database/ClientsDB.js';
import SaleItemsDB from '../database/SaleItemsDB.js';
import PaymentsDB from '../database/PaymentsDB.js';

document.addEventListener('DOMContentLoaded', async () => {
    const clientsDB = new ClientsDB();
    const saleItemsDB = new SaleItemsDB();
    const paymentsDB = new PaymentsDB();
    // UI Elements
    const searchInput = document.getElementById('clientSearch');
    const tableBody = document.getElementById('clientsTableBody');
    const filterContainer = document.getElementById('clientFilters');
    
    // Modal Elements
    const debtsModal = document.getElementById('debtsModal');
    const debtsModalTitle = document.getElementById('debtsModalTitle');
    const debtsModalBody = document.getElementById('debtsModalBody');
    const debtsModalFooter = document.getElementById('debtsModalFooter');
    const closeDebtsModalBtn = document.getElementById('closeDebtsModal');
    const saleDetailsModal = document.getElementById('saleDetailsModal');
    const saleDetailsModalTitle = document.getElementById('saleDetailsModalTitle');
    const saleDetailsModalBody = document.getElementById('saleDetailsModalBody');
    const closeSaleDetailsModalBtn = document.getElementById('closeSaleDetailsModal');
    const addPaymentModal = document.getElementById('addPaymentModal');
    const addPaymentModalTitle = document.getElementById('addPaymentModalTitle');
    const closeAddPaymentModalBtn = document.getElementById('closeAddPaymentModal');
    const savePaymentBtn = document.getElementById('savePaymentBtn');
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentNotesInput = document.getElementById('paymentNotes');
    const maxAmountInfo = document.getElementById('maxAmountInfo');
    let allClientsCache = [];
    let clientsWithCreditCache = [];
    let filterState = 'all';

    // Function to get query parameters
    function getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }

    const renderClients = () => {
        tableBody.innerHTML = '';
        const creditMap = new Map(clientsWithCreditCache.map(c => [c.client_id, c.total_remaining]));
        let clientsToRender = allClientsCache;
        if (filterState === 'debt') {
            clientsToRender = allClientsCache.filter(client => creditMap.has(client.client_id));
        }
        if (clientsToRender.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500 dark:text-gray-400">لا يوجد عملاء يطابقون المعايير.</td></tr>`;
            return;
        }
        clientsToRender.forEach(client => {
            const creditBalance = creditMap.get(client.client_id) || 0;
            
            const isRegularBadge = client.is_regular 
                ? `<span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-green-900 dark:text-green-300">نعم</span>`
                : `<span class="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-gray-700 dark:text-gray-300">لا</span>`;
            
            const creditClass = creditBalance > 0 ? 'text-danger font-semibold' : 'text-gray-500 dark:text-gray-400';
            const debtActions = creditBalance > 0 ? `
                <button class="add-payment-btn p-2 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50" title="إضافة دفعة" data-client-id="${client.client_id}" data-client-name="${client.name}" data-credit-balance="${creditBalance}">
                    <i data-lucide="plus-circle" class="w-4 h-4"></i>
                </button>
                <button class="view-debts-btn p-2 rounded-md text-warning dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50" title="عرض الديون" data-client-id="${client.client_id}" data-client-name="${client.name}">
                    <i data-lucide="receipt-text" class="w-4 h-4"></i>
                </button>
                <button class="settle-debts-btn p-2 rounded-md text-success dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50" title="تسوية الديون" data-client-id="${client.client_id}" data-client-name="${client.name}">
                    <i data-lucide="check-circle" class="w-4 h-4"></i>
                </button>
            ` : '';
            
            const row = `
                <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td class="p-3 font-medium text-gray-900 dark:text-white">${client.name}</td>
                    <td class="p-3" dir="ltr">${client.phone || '—'}</td>
                    <td class="p-3">${isRegularBadge}</td>
                    <td class="p-3 ${creditClass}">${creditBalance.toLocaleString()} د.ج</td>
                    <td class="p-3">
                        <div class="flex gap-2 justify-center">
                            ${debtActions}
                            <a href="add-client.html?id=${client.client_id}" class="p-2 rounded-md text-primary dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50" title="تعديل">
                                <i data-lucide="file-pen-line" class="w-4 h-4"></i>
                            </a>
                            <button class="delete-btn p-2 rounded-md text-danger dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50" title="حذف" data-id="${client.client_id}">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', row);
        });
        lucide.createIcons();
    };

    const loadAndRenderClients = async () => {
        const searchTerm = searchInput.value.trim();
        try {
            [allClientsCache, clientsWithCreditCache] = await Promise.all([
                clientsDB.getAllClients(searchTerm),
                clientsDB.getClientsWithCredit()
            ]);
            renderClients();
        } catch (error) {
            console.error('Failed to load clients:', error);
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-danger">حدث خطأ أثناء تحميل البيانات.</td></tr>`;
        }
    };

    // Function to update debts modal content
    const updateDebtsModal = async (clientId, clientName) => {
        try {
            // Refresh clientsWithCreditCache to ensure up-to-date debt information
            clientsWithCreditCache = await clientsDB.getClientsWithCredit();
            renderClients(); // Update main table to reflect any changes in credit balances
            
            debtsModalTitle.textContent = `ديون العميل: ${clientName}`;
            debtsModalBody.innerHTML = `<div class="text-center p-8"><i data-lucide="loader-2" class="animate-spin inline-block"></i> جاري تحميل الديون...</div>`;
            lucide.createIcons();
            const history = await clientsDB.getClientPurchaseHistory(clientId);
            const debtSales = history.filter(sale => sale.remaining > 0);
            if (debtSales.length === 0) {
                debtsModalBody.innerHTML = `<div class="text-center p-8 text-gray-500">لا توجد ديون حالية لهذا العميل.</div>`;
                debtsModalFooter.innerHTML = '';
                return;
            }
            const debtsHtml = `
                <div class="overflow-x-auto border dark:border-gray-700 rounded-lg">
                    <table class="w-full text-sm text-right">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th class="p-3 w-12 text-center">
                                    <input type="checkbox" id="selectAllInvoices" class="rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-900" title="تحديد الكل">
                                </th>
                                <th class="p-3">#</th>
                                <th class="p-3">التاريخ</th>
                                <th class="p-3">الإجمالي</th>
                                <th class="p-3">المتبقي</th>
                                <th class="p-3 text-center">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody id="debtInvoicesBody" class="divide-y dark:divide-gray-700">
                        ${debtSales.map(sale => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td class="p-3 text-center">
                                    <input type="checkbox" class="invoice-checkbox rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-900" data-sale-id="${sale.sale_id}">
                                </td>
                                <td class="p-3 font-medium">${sale.sale_id}</td>
                                <td class="p-3" dir="ltr">${sale.date}</td>
                                <td class="p-3">${sale.total.toLocaleString()} د.ج</td>
                                <td class="p-3 text-danger font-semibold">${sale.remaining.toLocaleString()} د.ج</td>
                                <td class="p-3">
                                    <div class="flex items-center justify-center gap-2">
                                        <button class="view-sale-details-btn p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600" data-sale-id="${sale.sale_id}" title="عرض التفاصيل">
                                            <i data-lucide="eye" class="w-4 h-4"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            debtsModalBody.innerHTML = debtsHtml;
            debtsModalFooter.innerHTML = `
                <button id="printSelectedInvoicesBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 w-full sm:w-auto justify-center">
                    <i data-lucide="printer" class="w-4 h-4"></i> 
                    <span id="printBtnText">طباعة الكشف الشامل</span>
                </button>
            `;
            const printButton = document.getElementById('printSelectedInvoicesBtn');
            const printBtnText = document.getElementById('printBtnText');
            const selectAllCheckbox = document.getElementById('selectAllInvoices');
            const invoiceCheckboxes = debtsModalBody.querySelectorAll('.invoice-checkbox');
            const updatePrintButtonState = () => {
                const selectedCount = debtsModalBody.querySelectorAll('.invoice-checkbox:checked').length;
                if (selectedCount > 0) {
                    printBtnText.textContent = `طباعة (${selectedCount}) فاتورة محددة`;
                } else {
                    printBtnText.textContent = 'طباعة الكشف الشامل';
                }
            };
            invoiceCheckboxes.forEach(checkbox => checkbox.addEventListener('change', updatePrintButtonState));
            selectAllCheckbox.addEventListener('change', () => {
                invoiceCheckboxes.forEach(checkbox => checkbox.checked = selectAllCheckbox.checked);
                updatePrintButtonState();
            });
            printButton.addEventListener('click', () => {
                const selectedInvoicesIds = Array.from(invoiceCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => parseInt(cb.dataset.saleId, 10));
                if (selectedInvoicesIds.length > 0) {
                    console.log("Printing selected invoices:", selectedInvoicesIds);
                    alert(`سيتم برمجة طباعة الفواتير المحددة: ${selectedInvoicesIds.join(', ')}`);
                } else {
                    console.log("Printing all debt invoices for client:", clientId);
                    alert("سيتم برمجة طباعة الكشف الشامل (كل الفواتير).");
                }
            });
            lucide.createIcons();
        } catch (error) {
            console.error("Error updating debts modal:", error);
            debtsModalBody.innerHTML = `<div class="text-center p-8 text-danger">فشل في تحميل الديون.</div>`;
            debtsModalFooter.innerHTML = '';
        }
    };

    // Event Listeners
    searchInput.addEventListener('input', loadAndRenderClients);
    filterContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.filter-btn');
        if (button) {
            filterContainer.querySelector('.active').classList.remove('active');
            button.classList.add('active');
            filterState = button.dataset.filter;
            renderClients();
        }
    });

    tableBody.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        const viewDebtsBtn = e.target.closest('.view-debts-btn');
        const settleDebtsBtn = e.target.closest('.settle-debts-btn');
        const addPaymentBtn = e.target.closest('.add-payment-btn');
        if (deleteBtn) {
            const clientId = parseInt(deleteBtn.dataset.id, 10);
            if (isNaN(clientId)) return;
            if (confirm('هل أنت متأكد من رغبتك في حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء.')) {
                try {
                    const purchaseHistory = await clientsDB.getClientPurchaseHistory(clientId);
                    if (purchaseHistory.length > 0) {
                        alert('لا يمكن حذف هذا العميل لأنه مرتبط بسجلات مبيعات.');
                        return;
                    }
                    await clientsDB.deleteClient(clientId);
                    await loadAndRenderClients();
                } catch (error) {
                    console.error('Failed to delete client:', error);
                    alert('فشل حذف العميل.');
                }
            }
        }
        if (viewDebtsBtn) {
            const clientId = parseInt(viewDebtsBtn.dataset.clientId, 10);
            const clientName = viewDebtsBtn.dataset.clientName;
            if (isNaN(clientId)) return;
            await updateDebtsModal(clientId, clientName);
            openModal(debtsModal);
        }
        if (settleDebtsBtn) {
            const clientId = parseInt(settleDebtsBtn.dataset.clientId, 10);
            const clientName = settleDebtsBtn.dataset.clientName;
            if (isNaN(clientId)) return;
            if (confirm(`هل أنت متأكد من تسوية جميع ديون "${clientName}"؟ سيتم إنشاء دفعة بالمبلغ المتبقي.`)) {
                try {
                    await clientsDB.settleClientDebts(clientId, paymentsDB);

                    // Update debts modal if open for this client
                    if (debtsModal.classList.contains('visible') && debtsModalTitle.textContent.includes(clientName)) {
                        await updateDebtsModal(clientId, clientName);
                    }

                    // Prepare URL with current filter and search parameters
                    let reloadUrl = 'clients.html';
                    const currentSearch = searchInput.value.trim();
                    const params = new URLSearchParams();
                    
                    if (filterState && filterState !== 'all') {
                        params.betrayed('filter', filterState);
                    }
                    if (currentSearch) {
                        params.append('search', currentSearch);
                    }
                    
                    if (params.toString()) {
                        reloadUrl += `?${params.toString()}`;
                    }

                    // Show success message and reload page
                    alert(`تمت تسوية ديون العميل ${clientName} بنجاح.`);
                    window.location.href = reloadUrl;
                } catch (error) {
                    console.error('Failed to settle debts:', error);
                    alert(`فشل في تسوية الديون: ${error.message}`);
                    // Reload page without params to ensure consistent state
                    window.location.href = 'clients.html';
                }
            }
        }
        if (addPaymentBtn) {
            const clientId = parseInt(addPaymentBtn.dataset.clientId, 10);
            const clientName = addPaymentBtn.dataset.clientName;
            const creditBalance = parseFloat(addPaymentBtn.dataset.creditBalance);
            if (isNaN(clientId)) return;
            addPaymentModalTitle.textContent = `إضافة دفعة للعميل: ${clientName}`;
            paymentAmountInput.value = '';
            paymentNotesInput.value = '';
            paymentAmountInput.max = creditBalance;
            maxAmountInfo.textContent = `المبلغ المتبقي: ${creditBalance.toLocaleString()} د.ج`;
            savePaymentBtn.dataset.clientId = clientId;
            savePaymentBtn.dataset.clientName = clientName;
            openModal(addPaymentModal);
        }
    });

    // Modal Logic
    const openModal = (modal) => {
        modal.classList.remove('invisible', 'opacity-0');
        modal.classList.add('visible', 'opacity-100');
    };
    const closeModal = (modal) => {
        modal.classList.remove('visible', 'opacity-100');
        modal.classList.add('invisible', 'opacity-0');
    };
    closeDebtsModalBtn.addEventListener('click', () => closeModal(debtsModal));
    closeSaleDetailsModalBtn.addEventListener('click', () => closeModal(saleDetailsModal));
    closeAddPaymentModalBtn.addEventListener('click', () => closeModal(addPaymentModal));
    
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(saleDetailsModal);
            closeModal(debtsModal);
            closeModal(addPaymentModal);
        }
    });

    savePaymentBtn.addEventListener('click', async () => {
        const clientId = parseInt(savePaymentBtn.dataset.clientId, 10);
        const clientName = savePaymentBtn.dataset.clientName;
        const amount = parseFloat(paymentAmountInput.value);
        const notes = paymentNotesInput.value.trim();
        
        if (isNaN(clientId)) {
            alert('خطأ: معرف العميل غير صالح.');
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            alert('الرجاء إدخال مبلغ صحيح أكبر من صفر.');
            return;
        }
        const maxAmount = parseFloat(paymentAmountInput.max);
        if (amount > maxAmount) {
            alert(`المبلغ المدفوع لا يمكن أن يكون أكبر من الدين المتبقي (${maxAmount.toLocaleString()} د.ج).`);
            return;
        }

        try {
            const newPayment = {
                client_id: clientId,
                date: new Date().toISOString().split('T')[0],
                amount: amount,
                notes: notes
            };
            await paymentsDB.addPayment(newPayment);

            // Update debts modal if open for this client
            if (debtsModal.classList.contains('visible') && debtsModalTitle.textContent.includes(clientName)) {
                await updateDebtsModal(clientId, clientName);
            }

            // Prepare URL with current filter and search parameters
            let reloadUrl = 'clients.html';
            const currentSearch = searchInput.value.trim();
            const params = new URLSearchParams();
            
            if (filterState && filterState !== 'all') {
                params.append('filter', filterState);
            }
            if (currentSearch) {
                params.append('search', currentSearch);
            }
            
            if (params.toString()) {
                reloadUrl += `?${params.toString()}`;
            }

            // Show success message and reload page
            alert('تمت إضافة الدفعة بنجاح.');
            closeModal(addPaymentModal);
            window.location.href = reloadUrl;
        } catch (error) {
            console.error("Failed to add payment:", error);
            alert(`فشل في إضافة الدفعة: ${error.message}`);
            // Reload page without params to ensure consistent state
            window.location.href = 'clients.html';
        }
    });

    debtsModalBody.addEventListener('click', async (e) => {
        const detailsBtn = e.target.closest('.view-sale-details-btn');
        if (detailsBtn) {
            const saleId = parseInt(detailsBtn.dataset.saleId, 10);
            if (isNaN(saleId)) return;
            saleDetailsModalTitle.textContent = `تفاصيل الفاتورة رقم #${saleId}`;
            saleDetailsModalBody.innerHTML = `<div class="text-center p-8"><i data-lucide="loader-2" class="animate-spin inline-block"></i> جاري تحميل التفاصيل...</div>`;
            lucide.createIcons();
            openModal(saleDetailsModal);
            try {
                const items = await saleItemsDB.getSaleItemsBySale(saleId);
                if (items.length === 0) {
                    saleDetailsModalBody.innerHTML = `<div class="text-center p-8 text-gray-500">لا توجد منتجات في هذه الفاتورة.</div>`;
                    return;
                }
                const itemsHtml = `
                    <div class="overflow-x-auto border dark:border-gray-700 rounded-lg">
                        <table class="w-full text-sm text-right">
                            <thead class="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th class="p-3">المنتج</th>
                                    <th class="p-3 text-center">الكمية</th>
                                    <th class="p-3">سعر الوحدة</th>
                                    <th class="p-3">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y dark:divide-gray-700">
                            ${items.map(item => `
                                <tr>
                                    <td class="p-3 font-medium text-gray-800 dark:text-white">${item.product_name}</td>
                                    <td class="p-3 text-center">${item.quantity}</td>
                                    <td class="p-3">${item.unit_price.toLocaleString()} د.ج</td>
                                    <td class="p-3 font-semibold">${item.total_price.toLocaleString()} د.ج</td>
                                </tr>
                            `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
                saleDetailsModalBody.innerHTML = itemsHtml;
            } catch (error) {
                console.error(`Failed to load details for sale #${saleId}:`, error);
                saleDetailsModalBody.innerHTML = `<div class="text-center p-8 text-danger">فشل في تحميل التفاصيل.</div>`;
            }
        }
    });

    // Apply query params if present
    const initialFilter = getQueryParam('filter');
    const initialSearch = getQueryParam('search');

    if (initialSearch) {
        searchInput.value = initialSearch;
    }

    if (initialFilter) {
        filterState = initialFilter;
        const filterButton = filterContainer.querySelector(`[data-filter="${initialFilter}"]`);
        if (filterButton) {
            filterContainer.querySelector('.active').classList.remove('active');
            filterButton.classList.add('active');
        }
    }

    // Initial Load
    await loadAndRenderClients();
});