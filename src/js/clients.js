// js/clients.js

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
    const paymentSalesTable = document.getElementById('paymentSalesTable');
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
            tableBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-gray-500 dark:text-gray-400">لا يوجد زبائن يطابقون المعايير.</td></tr>`;
            return;
        }
        clientsToRender.forEach(client => {
            const creditBalance = creditMap.get(client.client_id) || 0;
            
            const isRegularBadge = client.is_regular 
                ? `<span class="bg-success/20 text-success text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-success/30">نعم</span>`
                : `<span class="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-gray-700 dark:text-gray-300">لا</span>`;
            
            const creditClass = creditBalance > 0 ? 'text-danger font-semibold' : 'text-gray-500 dark:text-gray-400';
            const debtActions = creditBalance > 0 ? `
                <button class="add-payment-btn p-2 rounded-full text-primary dark:text-primary hover:bg-gray-100 dark:hover:bg-gray-700" title="إضافة دفعة" data-client-id="${client.client_id}" data-client-name="${client.name}" data-credit-balance="${creditBalance}">
                    <i data-lucide="plus-circle" class="w-5 h-5"></i>
                </button>
                <button class="view-debts-btn p-2 rounded-full text-warning dark:text-warning hover:bg-gray-100 dark:hover:bg-gray-700" title="عرض الديون" data-client-id="${client.client_id}" data-client-name="${client.name}">
                    <i data-lucide="receipt-text" class="w-5 h-5"></i>
                </button>
                <button class="settle-debts-btn p-2 rounded-full text-success dark:text-success hover:bg-gray-100 dark:hover:bg-gray-700" title="تسوية الديون" data-client-id="${client.client_id}" data-client-name="${client.name}">
                    <i data-lucide="check-circle" class="w-5 h-5"></i>
                </button>
            ` : '';
            
            const row = `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td class="p-3 font-medium text-gray-900 dark:text-white">${client.name}</td>
                    <td class="p-3" dir="ltr">${client.phone || '—'}</td>
                    <td class="p-3">${isRegularBadge}</td>
                    <td class="p-3 ${creditClass}">${creditBalance.toLocaleString()}</td>
                    <td class="p-3">
                        <div class="flex gap-2 justify-center">
                            ${debtActions}
                            <a href="add-client.html?id=${client.client_id}" class="p-2 rounded-full text-primary dark:text-primary hover:bg-gray-100 dark:hover:bg-gray-700" title="تعديل">
                                <i data-lucide="file-pen-line" class="w-5 h-5"></i>
                            </a>
                            <button class="delete-btn p-2 rounded-full text-danger dark:text-danger hover:bg-gray-100 dark:hover:bg-gray-700" title="حذف" data-id="${client.client_id}">
                                <i data-lucide="trash-2" class="w-5 h-5"></i>
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
            tableBody.innerHTML = `<tr><td colspan="5" class="p-3 text-center text-danger">حدث خطأ أثناء تحميل البيانات.</td></tr>`;
        }
    };

    // Function to update debts modal content
    const updateDebtsModal = async (clientId, clientName) => {
        try {
            clientsWithCreditCache = await clientsDB.getClientsWithCredit();
            renderClients();
            
            debtsModalTitle.textContent = `ديون العميل: ${clientName}`;
            debtsModalBody.innerHTML = `<div class="p-6 text-center"><i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i> جاري تحميل الديون...</div>`;
            lucide.createIcons();
            const history = await clientsDB.getClientPurchaseHistory(clientId);
            const debtSales = history.filter(sale => (sale.remaining || 0) > 0);
            if (debtSales.length === 0) {
                debtsModalBody.innerHTML = `<div class="p-6 text-center text-gray-500 dark:text-gray-400">لا توجد ديون حالية لهذا العميل.</div>`;
                debtsModalFooter.innerHTML = '';
                return;
            }
            const debtsHtml = `
                <div class="overflow-x-auto full-width-table-container">
                    <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                        <thead class="text-sm text-gray-700 dark:text-gray-300 uppercase bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th class="p-3 w-12 text-center">
                                    <input type="checkbox" id="selectAllInvoices" class="rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-700" title="تحديد الكل">
                                </th>
                                <th class="p-3 text-right">رقم الفاتورة</th>
                                <th class="p-3 text-right">التاريخ</th>
                                <th class="p-3 text-right">الإجمالي</th>
                                <th class="p-3 text-right">المتبقي</th>
                                <th class="p-3 text-right">سعر التوصيل</th>
                                <th class="p-3 text-right">تكلفة العامل</th>
                                <th class="p-3 text-center">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        ${debtSales.map(sale => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                <td class="p-3 text-center">
                                    <input type="checkbox" class="invoice-checkbox rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-700" data-sale-id="${sale.sale_id}">
                                </td>
                                <td class="p-3 font-medium">${sale.sale_id}</td>
                                <td class="p-3" dir="ltr">${sale.date}</td>
                                <td class="p-3">${(sale.total || 0).toLocaleString()}</td>
                                <td class="p-3 text-danger font-semibold">${(sale.remaining || 0).toLocaleString()}</td>
                                <td class="p-3">${(sale.delivery_price || 0).toLocaleString()}</td>
                                <td class="p-3">${(sale.labor_cost || 0).toLocaleString()}</td>
                                <td class="p-3">
                                    <div class="flex items-center justify-center gap-2">
                                        <button class="view-sale-details-btn p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" data-sale-id="${sale.sale_id}" data-delivery-price="${sale.delivery_price || 0}" data-labor-cost="${sale.labor_cost || 0}" title="عرض التفاصيل">
                                            <i data-lucide="eye" class="w-5 h-5"></i>
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
                <button id="printSelectedInvoicesBtn" class="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 flex items-center gap-2">
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
                printBtnText.textContent = selectedCount > 0 ? `طباعة (${selectedCount}) فاتورة محددة` : 'طباعة الكشف الشامل';
            };
            invoiceCheckboxes.forEach(checkbox => checkbox.addEventListener('change', updatePrintButtonState));
            selectAllCheckbox.addEventListener('change', () => {
                invoiceCheckboxes.forEach(checkbox => checkbox.checked = selectAllCheckbox.checked);
                updatePrintButtonState();
            });
            printButton.addEventListener('click', async () => {
                const selectedInvoicesIds = Array.from(invoiceCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => parseInt(cb.dataset.saleId, 10));
                if (selectedInvoicesIds.length > 0) {
                    await printDebtInvoices(clientName, debtSales.filter(sale => selectedInvoicesIds.includes(sale.sale_id)), false);
                } else {
                    await printDebtInvoices(clientName, debtSales, true);
                }
            });
            lucide.createIcons();
        } catch (error) {
            console.error("Error updating debts modal:", error);
            debtsModalBody.innerHTML = `<div class="p-6 text-center text-danger">فشل في تحميل الديون.</div>`;
            debtsModalFooter.innerHTML = '';
        }
    };

    // Function to update sale details modal content
    const updateSaleDetailsModal = async (saleId, deliveryPrice, laborCost) => {
        try {
            saleDetailsModalTitle.textContent = `تفاصيل الفاتورة رقم #${saleId}`;
            saleDetailsModalBody.innerHTML = `<div class="p-6 text-center"><i data-lucide="loader-2" class="w-6 h-6 animate-spin"></i> جاري تحميل التفاصيل...</div>`;
            lucide.createIcons();
            const items = await saleItemsDB.getSaleItemsBySale(saleId);
            if (items.length === 0) {
                saleDetailsModalBody.innerHTML = `<div class="p-6 text-center text-gray-500 dark:text-gray-400">لا توجد منتجات في هذه الفاتورة.</div>`;
                return;
            }
            const itemsHtml = `
                <div class="overflow-x-auto full-width-table-container">
                    <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                        <thead class="text-sm text-gray-700 dark:text-gray-300 uppercase bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th class="p-3 text-right">المنتج</th>
                                <th class="p-3 text-center">الكمية</th>
                                <th class="p-3 text-right">سعر الوحدة</th>
                                <th class="p-3 text-right">الخصم</th>
                                <th class="p-3 text-right">الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            ${items.map(item => `
                                <tr>
                                    <td class="p-3 font-medium text-gray-900 dark:text-white">${item.product_name}</td>
                                    <td class="p-3 text-center">${item.quantity}</td>
                                    <td class="p-3">${(item.unit_price || 0).toLocaleString()}</td>
                                    <td class="p-3">${(item.discount || 0).toLocaleString()}</td>
                                    <td class="p-3 font-semibold">${(item.total_price || 0).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                            <tr class="bg-gray-50 dark:bg-gray-700">
                                <td class="p-3 font-medium text-gray-900 dark:text-white" colspan="4">سعر التوصيل</td>
                                <td class="p-3 font-semibold">${(deliveryPrice || 0).toLocaleString()}</td>
                            </tr>
                            <tr class="bg-gray-50 dark:bg-gray-700">
                                <td class="p-3 font-medium text-gray-900 dark:text-white" colspan="4">تكلفة العامل</td>
                                <td class="p-3 font-semibold">${(laborCost || 0).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
            saleDetailsModalBody.innerHTML = itemsHtml;
        } catch (error) {
            console.error(`Failed to load details for sale #${saleId}:`, error);
            saleDetailsModalBody.innerHTML = `<div class="p-6 text-center text-danger">فشل في تحميل التفاصيل.</div>`;
        }
    };

    // Function to update payment modal with selectable sales
    const updatePaymentModal = async (clientId, clientName, creditBalance) => {
        try {
            addPaymentModalTitle.textContent = `إضافة دفعة للعميل: ${clientName}`;
            paymentAmountInput.value = '';
            paymentNotesInput.value = '';
            paymentAmountInput.max = creditBalance;
            paymentAmountInput.dataset.totalCreditBalance = creditBalance;
            maxAmountInfo.textContent = `المبلغ المتبقي: ${creditBalance.toLocaleString()}`;
            savePaymentBtn.dataset.clientId = clientId;
            savePaymentBtn.dataset.clientName = clientName;

            // Load credit sales for the client
            const history = await clientsDB.getClientPurchaseHistory(clientId);
            const creditSales = history.filter(sale => (sale.remaining || 0) > 0);
            if (creditSales.length === 0) {
                paymentSalesTable.innerHTML = `<div class="p-4 text-center text-gray-500 dark:text-gray-400">لا توجد مبيعات ائتمانية متبقية لهذا العميل.</div>`;
            } else {
                paymentSalesTable.innerHTML = `
                    <table class="w-full text-sm text-gray-600 dark:text-gray-400">
                        <thead class="text-sm text-gray-700 dark:text-gray-300 uppercase bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th class="p-3 w-12 text-center">
                                    <input type="checkbox" id="selectAllPaymentSales" class="rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-700" title="تحديد الكل">
                                </th>
                                <th class="p-3 text-right">رقم الفاتورة</th>
                                <th class="p-3 text-right">التاريخ</th>
                                <th class="p-3 text-right">الإجمالي</th>
                                <th class="p-3 text-right">المتبقي</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            ${creditSales.map(sale => `
                                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td class="p-3 text-center">
                                        <input type="checkbox" class="payment-sale-checkbox rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-700" data-sale-id="${sale.sale_id}" data-remaining="${sale.remaining || 0}">
                                    </td>
                                    <td class="p-3 font-medium">${sale.sale_id}</td>
                                    <td class="p-3" dir="ltr">${sale.date}</td>
                                    <td class="p-3">${(sale.total || 0).toLocaleString()}</td>
                                    <td class="p-3 text-danger font-semibold">${(sale.remaining || 0).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
                const selectAllCheckbox = document.getElementById('selectAllPaymentSales');
                const saleCheckboxes = paymentSalesTable.querySelectorAll('.payment-sale-checkbox');
                selectAllCheckbox.addEventListener('change', () => {
                    saleCheckboxes.forEach(checkbox => checkbox.checked = selectAllCheckbox.checked);
                    updatePaymentAmountLimit();
                });
                saleCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', updatePaymentAmountLimit);
                });
                paymentAmountInput.addEventListener('input', () => {
                    const amount = parseFloat(paymentAmountInput.value);
                    const maxAllowedAmount = parseFloat(paymentAmountInput.max);
                    if (!isNaN(amount) && amount > maxAllowedAmount && maxAllowedAmount > 0) {
                        paymentAmountInput.value = maxAllowedAmount;
                    }
                });
                const selectedCheckboxes = paymentSalesTable.querySelectorAll('.payment-sale-checkbox');
                selectedCheckboxes.forEach(checkbox => {
                    checkbox.addEventListener('change', () => {
                        const amount = parseFloat(paymentAmountInput.value);
                        const maxAllowedAmount = parseFloat(paymentAmountInput.max);
                        if (!isNaN(amount) && amount > maxAllowedAmount && maxAllowedAmount > 0) {
                            paymentAmountInput.value = maxAllowedAmount;
                        }
                    });
                });
                lucide.createIcons();
            }
            updatePaymentAmountLimit();
        } catch (error) {
            console.error('Failed to load credit sales for payment modal:', error);
            paymentSalesTable.innerHTML = `<div class="p-4 text-center text-danger">فشل في تحميل المبيعات الائتمانية.</div>`;
        }
    };

    // Function to update payment amount limit based on selected sales
    const updatePaymentAmountLimit = () => {
        const selectedCheckboxes = paymentSalesTable.querySelectorAll('.payment-sale-checkbox:checked');
        let maxAllowedAmount = parseFloat(paymentAmountInput.dataset.totalCreditBalance || paymentAmountInput.max);
        if (selectedCheckboxes.length > 0) {
            maxAllowedAmount = Array.from(selectedCheckboxes).reduce((sum, checkbox) => {
                return sum + parseFloat(checkbox.dataset.remaining || 0);
            }, 0);
        }
        maxAmountInfo.textContent = `الحد الأقصى للدفعة: ${maxAllowedAmount.toLocaleString()}`;
        paymentAmountInput.max = maxAllowedAmount;
        const amount = parseFloat(paymentAmountInput.value);
        if (!isNaN(amount) && amount > maxAllowedAmount && maxAllowedAmount > 0) {
            paymentAmountInput.value = maxAllowedAmount;
        }
    };

    /**
     *  ===============[ التعديل الرئيسي هنا ]===============
     *  دالة الطباعة المعدلة مع إرشادات لسيرفر الطباعة
     */
    async function printDebtInvoices(clientName, debtSales, isSummary) {
        const ports = ['5000', '5001'];
        let lastError = null;

        // 1. تجميع البيانات مع التأكد من وجود كل الحقول المطلوبة
        const invoices = await Promise.all(debtSales.map(async (sale) => {
            const items = await saleItemsDB.getSaleItemsBySale(sale.sale_id);
            return {
                sale_id: sale.sale_id,
                date: sale.date, // التاريخ يجب أن يكون بصيغة YYYY-MM-DD من قاعدة البيانات
                total: sale.total || 0,
                remaining: sale.remaining || 0,
                labor_cost: sale.labor_cost || 0,       // إرسال تكلفة العامل
                delivery_price: sale.delivery_price || 0, // إرسال سعر التوصيل
                items: items.map(item => ({
                    product_name: item.product_name, // استخدام اسم الحقل الأصلي
                    quantity: item.quantity,
                    unit_price: item.unit_price || 0,
                    discount: item.discount || 0,
                    total_price: item.total_price || 0
                }))
            };
        }));

        const totalRemaining = debtSales.reduce((sum, sale) => sum + (sale.remaining || 0), 0);

        // 2. بناء كائن البيانات الذي سيتم إرساله للطباعة
        const printData = {
            // *** إرشادات لسيرفر الطباعة ***
            // سيرفر الطباعة يجب أن يقرأ هذه البيانات وينسقها كإيصال مناسب لورق 80مم.
            // - تجنب استخدام الجداول متعددة الأعمدة التي قد تسبب اكتظاظاً.
            // - استخدم تنسيق سطر بسطر.
            // - بالنسبة لـ labor_cost و delivery_price، يجب عرضهما فقط إذا كانت قيمتهما أكبر من صفر.
            // - الأسعار يمكن تنسيقها باستخدام فواصل الآلاف (e.g., 1,250,000)
            
            type: isSummary ? 'debt_summary' : 'debt_invoices',
            clientName: clientName,
            companyName: 'مؤسسة بوطويل لبيع مواد البناء',
            companyInfo: ["العنوان: جيجل، الشقفة، مزوارة", "الهاتف: 0660091466"],
            invoices: invoices, // قائمة الفواتير مع كل تفاصيلها
            totalRemaining: totalRemaining,
            printDate: new Date().toISOString().split('T')[0] // تاريخ الطباعة بصيغة YYYY-MM-DD
        };

        for (const port of ports) {
            try {
                const response = await fetch(`http://127.0.0.1:${port}/print`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                    },
                    body: JSON.stringify(printData)
                });

                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || `فشل الاتصال بخادم الطباعة على البورت ${port}`);
                }
                return;
            } catch (error) {
                console.error(`Error printing on port ${port}:`, error.message);
                lastError = error;
            }
        }

        alert(`فشل الطباعة: تأكد من أن برنامج الطباعة يعمل. الخطأ: ${lastError.message}`);
    }
    // =================[ نهاية التعديل ]=================

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
                    if (debtsModal.classList.contains('visible') && debtsModalTitle.textContent.includes(clientName)) {
                        await updateDebtsModal(clientId, clientName);
                    }
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
                    window.location.href = reloadUrl;
                } catch (error) {
                    console.error('Failed to settle debts:', error);
                    alert(`فشل في تسوية الديون: ${error.message}`);
                    window.location.href = 'clients.html';
                }
            }
        }
        if (addPaymentBtn) {
            const clientId = parseInt(addPaymentBtn.dataset.clientId, 10);
            const clientName = addPaymentBtn.dataset.clientName;
            const creditBalance = parseFloat(addPaymentBtn.dataset.creditBalance);
            if (isNaN(clientId)) return;
            paymentAmountInput.dataset.totalCreditBalance = creditBalance;
            await updatePaymentModal(clientId, clientName, creditBalance);
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
        const selectedSaleIds = Array.from(paymentSalesTable.querySelectorAll('.payment-sale-checkbox:checked'))
            .map(cb => parseInt(cb.dataset.saleId, 10));
        
        if (isNaN(clientId)) {
            alert('خطأ: معرف العميل غير صالح.');
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            alert('الرجاء إدخال مبلغ صحيح أكبر من صفر.');
            return;
        }
        const maxAmount = parseFloat(paymentAmountInput.max);
        if (selectedSaleIds.length > 0 && amount > maxAmount) {
            paymentAmountInput.value = maxAmount;
            return;
        }
        if (amount > parseFloat(paymentAmountInput.dataset.totalCreditBalance)) {
            paymentAmountInput.value = parseFloat(paymentAmountInput.dataset.totalCreditBalance);
            return;
        }

        try {
            const newPayment = {
                client_id: clientId,
                date: new Date().toISOString().split('T')[0],
                amount: amount,
                notes: notes,
                sale_ids: selectedSaleIds.length > 0 ? selectedSaleIds : undefined
            };
            await paymentsDB.addPayment(newPayment);
            if (debtsModal.classList.contains('visible') && debtsModalTitle.textContent.includes(clientName)) {
                await updateDebtsModal(clientId, clientName);
            }
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
            closeModal(addPaymentModal);
            window.location.href = reloadUrl;
        } catch (error) {
            console.error("Failed to add payment:", error);
            alert(`فشل في إضافة الدفعة: ${error.message}`);
            window.location.href = 'clients.html';
        }
    });

    debtsModalBody.addEventListener('click', async (e) => {
        const detailsBtn = e.target.closest('.view-sale-details-btn');
        if (detailsBtn) {
            const saleId = parseInt(detailsBtn.dataset.saleId, 10);
            const deliveryPrice = parseFloat(detailsBtn.dataset.deliveryPrice) || 0;
            const laborCost = parseFloat(detailsBtn.dataset.laborCost) || 0;
            if (isNaN(saleId)) return;
            await updateSaleDetailsModal(saleId, deliveryPrice, laborCost);
            openModal(saleDetailsModal);
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