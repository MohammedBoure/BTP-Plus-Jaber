import ClientsDB from '../database/ClientsDB.js';
import SalesDB from '../database/SalesDB.js';
import SaleItemsDB from '../database/SaleItemsDB.js';
import Database from '../database/Database.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('add-sale.js: بدء تهيئة الصفحة');
    const db = new Database();
    const clientsDB = new ClientsDB();
    const salesDB = new SalesDB();
    const saleItemsDB = new SaleItemsDB();

    // العناصر في الواجهة
    const clientSearch = document.getElementById('clientSearch');
    const clientSelect = document.getElementById('clientSelect');
    const saleDate = document.getElementById('saleDate');
    const isCredit = document.getElementById('isCredit');
    const saleDiscount = document.getElementById('saleDiscount');
    const deliveryPrice = document.getElementById('deliveryPrice');
    const laborCost = document.getElementById('laborCost');
    const productSearch = document.getElementById('productSearch');
    const productSelect = document.getElementById('productSelect');
    const quantityInput = document.getElementById('quantity');
    const unitPriceInput = document.getElementById('unitPrice');
    const itemDiscountInput = document.getElementById('itemDiscount');
    const addItemButton = document.getElementById('addItem');
    const saleItemsTableBody = document.getElementById('saleItemsTableBody');
    const subtotalDisplay = document.getElementById('subtotal');
    const totalDiscountDisplay = document.getElementById('totalDiscount');
    const totalDisplay = document.getElementById('total');
    const paidAmountInput = document.getElementById('paidAmount');
    const remainingDisplay = document.getElementById('remaining');
    const submitSaleButton = document.getElementById('submitSale');

    // التحقق من وجود العناصر
    if (!submitSaleButton) {
        console.error('add-sale.js: زر تأكيد البيع غير موجود في DOM');
        alert('خطأ في تحميل الصفحة: زر تأكيد البيع غير موجود');
        return;
    }

    // إضافة: وضع التاريخ تلقائياً على اليوم
    if (saleDate) {
        saleDate.value = new Date().toISOString().split('T')[0];
        console.log('add-sale.js: تم تعيين التاريخ إلى اليوم:', saleDate.value);
    }

    // قائمة مؤقتة لعناصر المبيعات
    let saleItems = [];

    // تحميل العملاء
    async function loadClients(searchTerm = '') {
        console.log('add-sale.js: تحميل العملاء مع البحث:', searchTerm);
        try {
            const clients = await clientsDB.getAllClients(searchTerm);
            console.log('add-sale.js: تم استرجاع العملاء:', clients.length);
            clientSelect.innerHTML = '<option value="">بدون عميل (بيع نقدي)</option>';
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.client_id;
                option.textContent = `${client.name} (${client.phone || 'بدون هاتف'})`;
                clientSelect.appendChild(option);
            });
        } catch (error) {
            console.error('add-sale.js: خطأ في تحميل العملاء:', error.message, error.stack);
            alert('فشل تحميل العملاء: ' + error.message);
        }
    }

    // تحميل المنتجات
    async function loadProducts(searchTerm = '') {
        console.log('add-sale.js: تحميل المنتجات مع البحث:', searchTerm);
        try {
            const dbInstance = await db.getDB();
            const query = searchTerm
                ? `SELECT * FROM products WHERE name LIKE ? ORDER BY name;`
                : `SELECT * FROM products ORDER BY name;`;
            const stmt = dbInstance.prepare(query, searchTerm ? [`%${searchTerm}%`] : []);
            const products = [];
            while (stmt.step()) {
                products.push(stmt.getAsObject());
            }
            stmt.free();
            console.log('add-sale.js: تم استرجاع المنتجات:', products.length);
            productSelect.innerHTML = '<option value="">اختر منتجًا</option>';
            products.forEach(product => {
                const option = document.createElement('option');
                option.value = product.product_id;
                option.textContent = `${product.name} (${product.unit}, ${product.price_per_unit} لكل وحدة, المخزون: ${product.stock_quantity})`;
                option.dataset.price = product.price_per_unit;
                option.dataset.stock = product.stock_quantity;
                productSelect.appendChild(option);
            });
        } catch (error) {
            console.error('add-sale.js: خطأ في تحميل المنتجات:', error.message, error.stack);
            alert('فشل تحميل المنتجات: ' + error.message);
        }
    }

    // تحديث الملخص
    function updateSummary() {
        console.log('add-sale.js: تحديث الملخص');
        const subtotal = saleItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const totalItemDiscount = saleItems.reduce((sum, item) => sum + item.discountAmount, 0);
        const saleDiscountValue = parseFloat(saleDiscount.value) || 0;
        const deliveryPriceValue = parseFloat(deliveryPrice.value) || 0;
        const laborCostValue = parseFloat(laborCost.value) || 0;
        const totalDiscount = totalItemDiscount + saleDiscountValue;
        let total = subtotal - totalDiscount + deliveryPriceValue + laborCostValue;
        if (total < 0) total = 0; // منع الإجمالي من أن يكون سالبًا

        // إضافة: تحديث المبلغ المدفوع بناءً على نوع البيع
        if (isCredit.value === '0') { // بيع نقدي
            console.log('add-sale.js: نوع البيع نقدي، تعيين المبلغ المدفوع تلقائياً');
            paidAmountInput.value = total.toFixed(2);
            paidAmountInput.readOnly = true;
            paidAmountInput.classList.add('bg-gray-200', 'dark:bg-gray-600');
        } else { // بيع بالائتمان
            console.log('add-sale.js: نوع البيع ائتمان، تمكين إدخال المبلغ المدفوع');
            paidAmountInput.readOnly = false;
            paidAmountInput.classList.remove('bg-gray-200', 'dark:bg-gray-600');
        }

        const paid = parseFloat(paidAmountInput.value) || 0;
        const remaining = total - paid;

        console.log('add-sale.js: الحسابات:', {
            subtotal,
            totalItemDiscount,
            saleDiscountValue,
            deliveryPriceValue,
            laborCostValue,
            totalDiscount,
            total,
            paid,
            remaining
        });

        subtotalDisplay.textContent = subtotal.toFixed(2);
        totalDiscountDisplay.textContent = totalDiscount.toFixed(2);
        totalDisplay.textContent = total.toFixed(2);
        remainingDisplay.textContent = remaining.toFixed(2);
    }

    // إضافة عنصر مبيعة إلى الجدول
    function addItemToTable(item) {
        console.log('add-sale.js: إضافة عنصر إلى الجدول:', item);
        const row = document.createElement('tr');
        row.dataset.productId = item.productId;
        row.innerHTML = `
            <td class="p-2 align-middle">${item.productName}</td>
            <td class="p-2 align-middle text-left">${item.quantity}</td>
            <td class="p-2 align-middle text-left">${item.unitPrice.toFixed(2)}</td>
            <td class="p-2 align-middle text-left">${item.discountAmount.toFixed(2)}</td>
            <td class="p-2 align-middle text-left font-semibold">${((item.quantity * item.unitPrice) - item.discountAmount).toFixed(2)}</td>
            <td class="p-2 align-middle text-center">
                <button class="remove-item text-red-500 hover:bg-red-100 dark:hover:bg-gray-700 p-1.5 rounded-md transition-colors" title="إزالة العنصر">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </td>
        `;
        row.querySelector('.remove-item').addEventListener('click', () => {
            console.log('add-sale.js: إزالة عنصر:', item.productId);
            saleItems = saleItems.filter(i => i.productId !== item.productId);
            row.remove();
            updateSummary();
        });
        saleItemsTableBody.appendChild(row);
        lucide.createIcons(); // تحديث: تصيير الأيقونة الجديدة
    }

    // البحث عن العملاء
    clientSearch.addEventListener('input', () => {
        console.log('add-sale.js: البحث عن العملاء:', clientSearch.value);
        loadClients(clientSearch.value);
    });

    // البحث عن المنتجات
    productSearch.addEventListener('input', () => {
        console.log('add-sale.js: البحث عن المنتجات:', productSearch.value);
        loadProducts(productSearch.value);
    });

    // تحديث سعر الوحدة عند اختيار منتج
    productSelect.addEventListener('change', () => {
        console.log('add-sale.js: اختيار منتج:', productSelect.value);
        const selectedOption = productSelect.selectedOptions[0];
        if (selectedOption && selectedOption.value) {
            unitPriceInput.value = parseFloat(selectedOption.dataset.price).toFixed(2);
            quantityInput.max = selectedOption.dataset.stock;
            console.log('add-sale.js: سعر الوحدة:', unitPriceInput.value, 'الحد الأقصى للكمية:', quantityInput.max);
        } else {
            unitPriceInput.value = '';
            quantityInput.max = '';
        }
    });

    // إضافة عنصر مبيعة
    addItemButton.addEventListener('click', () => {
        console.log('add-sale.js: النقر على زر إضافة المنتج');
        const productId = parseInt(productSelect.value);
        const quantity = parseFloat(quantityInput.value);
        const unitPrice = parseFloat(unitPriceInput.value);
        const discountAmount = parseFloat(itemDiscountInput.value) || 0;

        console.log('add-sale.js: بيانات العنصر:', { productId, quantity, unitPrice, discountAmount });

        if (!productId || !quantity || !unitPrice) {
            console.error('add-sale.js: بيانات غير صالحة:', { productId, quantity, unitPrice });
            alert('يرجى اختيار منتج وتحديد الكمية وسعر الوحدة.');
            return;
        }

        if (quantity > parseFloat(productSelect.selectedOptions[0].dataset.stock)) {
            console.error('add-sale.js: الكمية تتجاوز المخزون:', {
                quantity,
                stock: productSelect.selectedOptions[0].dataset.stock
            });
            alert('الكمية المطلوبة تتجاوز المخزون المتاح.');
            return;
        }

        if (discountAmount > quantity * unitPrice) {
            console.error('add-sale.js: الخصم يتجاوز إجمالي العنصر:', {
                discountAmount,
                total: quantity * unitPrice
            });
            alert('الخصم لا يمكن أن يكون أكبر من إجمالي العنصر.');
            return;
        }

        const productName = productSelect.selectedOptions[0].textContent.split(' (')[0];
        const item = {
            productId,
            productName,
            quantity,
            unitPrice,
            discountAmount,
            totalPrice: (quantity * unitPrice) - discountAmount
        };

        if (saleItems.some(i => i.productId === productId)) {
            console.error('add-sale.js: المنتج موجود بالفعل:', productId);
            alert('هذا المنتج موجود بالفعل في القائمة.');
            return;
        }

        saleItems.push(item);
        addItemToTable(item);
        updateSummary();

        // إعادة تعيين الحقول
        productSelect.value = '';
        quantityInput.value = '1';
        unitPriceInput.value = '';
        itemDiscountInput.value = '0';
        productSearch.value = '';
        loadProducts();
    });

    // تحديث الملخص عند تغيير الحقول
    isCredit.addEventListener('change', () => {
        console.log('add-sale.js: تغيير نوع البيع:', isCredit.value);
        updateSummary();
    });
    saleDiscount.addEventListener('input', () => {
        console.log('add-sale.js: تغيير الخصم على البيع:', saleDiscount.value);
        updateSummary();
    });
    deliveryPrice.addEventListener('input', () => {
        console.log('add-sale.js: تغيير تكلفة التوصيل:', deliveryPrice.value);
        updateSummary();
    });
    laborCost.addEventListener('input', () => {
        console.log('add-sale.js: تغيير سعر العامل:', laborCost.value);
        updateSummary();
    });
    paidAmountInput.addEventListener('input', () => {
        console.log('add-sale.js: تغيير المبلغ المدفوع:', paidAmountInput.value);
        updateSummary();
    });

    // تأكيد البيع
    submitSaleButton.addEventListener('click', async () => {
        console.log('add-sale.js: النقر على زر تأكيد البيع');
        console.log('add-sale.js: التحقق من وجود عناصر مبيعات:', saleItems.length);
        if (saleItems.length === 0) {
            console.error('add-sale.js: لا توجد عناصر مبيعات');
            alert('يرجى إضافة منتج واحد على الأقل.');
            return;
        }

        const clientId = clientSelect.value ? parseInt(clientSelect.value) : null;
        const date = saleDate.value;
        const isCreditValue = parseInt(isCredit.value);
        const saleDiscountValue = parseFloat(saleDiscount.value) || 0;
        const deliveryPriceValue = parseFloat(deliveryPrice.value) || 0;
        const laborCostValue = parseFloat(laborCost.value) || 0;
        const subtotal = saleItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const totalDiscount = saleItems.reduce((sum, item) => sum + item.discountAmount, 0) + saleDiscountValue;
        const total = subtotal - totalDiscount + deliveryPriceValue + laborCostValue;
        const paid = parseFloat(paidAmountInput.value) || 0;
        const remaining = total - paid;

        console.log('add-sale.js: بيانات المبيعة المجمعة:', {
            clientId,
            date,
            isCreditValue,
            saleDiscountValue,
            deliveryPriceValue,
            laborCostValue,
            subtotal,
            totalDiscount,
            total,
            paid,
            remaining,
            saleItems
        });

        // التحقق من البيانات
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.error('add-sale.js: تاريخ غير صالح:', date);
            alert('يرجى إدخال تاريخ صالح بصيغة YYYY-MM-DD.');
            return;
        }

        if (total < 0 || paid < 0 || saleDiscountValue < 0 || deliveryPriceValue < 0 || laborCostValue < 0) {
            console.error('add-sale.js: قيم مالية غير صالحة:', { total, paid, saleDiscountValue, deliveryPriceValue, laborCostValue });
            alert('القيم المالية يجب ألا تكون سالبة.');
            return;
        }

        if (isCreditValue === 0 && Math.abs(paid - total) > 0.001) { // Use a small tolerance for float comparison
            console.error('add-sale.js: البيع النقدي يتطلب الدفع الكامل:', { paid, total });
            alert('البيع النقدي يتطلب دفع المبلغ الإجمالي.');
            return;
        }

        // التحقق من وجود العميل
        if (clientId) {
            try {
                const dbInstance = await db.getDB();
                const clientStmt = dbInstance.prepare('SELECT 1 FROM clients WHERE client_id = ?;', [clientId]);
                if (!clientStmt.step()) {
                    clientStmt.free();
                    console.error('add-sale.js: العميل غير موجود:', clientId);
                    alert(`العميل بمعرف ${clientId} غير موجود.`);
                    return;
                }
                clientStmt.free();
                console.log('add-sale.js: تم التحقق من وجود العميل:', clientId);
            } catch (error) {
                console.error('add-sale.js: خطأ في التحقق من العميل:', error.message, error.stack);
                alert('فشل التحقق من العميل: ' + error.message);
                return;
            }
        }

        try {
            console.log('add-sale.js: بدء معاملة قاعدة البيانات');
            const dbInstance = await db.getDB();
            dbInstance.run('BEGIN TRANSACTION;');
            console.log('add-sale.js: المعاملة بدأت');

            try {
                // إضافة المبيعة
                const sale = {
                    client_id: clientId,
                    date,
                    subtotal,
                    sale_discount_amount: saleDiscountValue,
                    delivery_price: deliveryPriceValue,
                    labor_cost: laborCostValue,
                    total,
                    paid,
                    remaining,
                    is_credit: isCreditValue
                };
                console.log('add-sale.js: إضافة المبيعة مباشرة:', sale);

                // تنفيذ استعلام إضافة المبيعة
                const saleParams = [clientId || null, date, subtotal, saleDiscountValue, deliveryPriceValue, laborCostValue, total, paid, remaining, isCreditValue ? 1 : 0];
                console.log('add-sale.js: تنفيذ استعلام إضافة المبيعة مع المعلمات:', saleParams);
                const saleStmt = dbInstance.prepare(
                    `INSERT INTO sales (client_id, date, subtotal, sale_discount_amount, delivery_price, labor_cost, total, paid, remaining, is_credit) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                    saleParams
                );
                saleStmt.run();
                const saleId = dbInstance.exec('SELECT last_insert_rowid() AS id;')[0].values[0][0];
                saleStmt.free();
                console.log('add-sale.js: تم إضافة المبيعة بمعرف:', saleId);

                // التحقق من إدراج المبيعة
                const checkSaleStmt = dbInstance.prepare('SELECT * FROM sales WHERE sale_id = ?;', [saleId]);
                if (checkSaleStmt.step()) {
                    console.log('add-sale.js: المبيعة المدرجة:', checkSaleStmt.getAsObject());
                } else {
                    checkSaleStmt.free();
                    console.error('add-sale.js: فشل استرجاع المبيعة المدرجة:', saleId);
                    throw new Error(`Failed to verify inserted sale with ID ${saleId}`);
                }
                checkSaleStmt.free();

                // إضافة عناصر المبيعات
                console.log('add-sale.js: إضافة عناصر المبيعات للمبيعة:', saleId);
                const saleItemsData = saleItems.map(item => ({
                    sale_id: saleId,
                    product_id: item.productId,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    discount_amount: item.discountAmount,
                    total_price: item.totalPrice
                }));
                console.log('add-sale.js: بيانات عناصر المبيعات:', saleItemsData);

                for (const [index, item] of saleItemsData.entries()) {
                    console.log(`add-sale.js: معالجة العنصر ${index + 1}:`, item);
                    // التحقق من المخزون
                    const stockStmt = dbInstance.prepare('SELECT stock_quantity, name FROM products WHERE product_id = ?;', [item.product_id]);
                    let stock = 0;
                    let productName = '';
                    if (stockStmt.step()) {
                        const result = stockStmt.getAsObject();
                        stock = result.stock_quantity;
                        productName = result.name;
                    } else {
                        stockStmt.free();
                        console.error(`add-sale.js: المنتج غير موجود: ${item.product_id}`);
                        throw new Error(`Product with ID ${item.product_id} not found.`);
                    }
                    stockStmt.free();
                    console.log(`add-sale.js: المخزون المتاح للمنتج ${productName} (ID: ${item.product_id}): ${stock}`);

                    if (stock < item.quantity) {
                        console.error(`add-sale.js: المخزون غير كافٍ للمنتج ${productName} (ID: ${item.product_id}):`, {
                            available: stock,
                            requested: item.quantity
                        });
                        throw new Error(`Insufficient stock for product ${productName} (ID: ${item.product_id}). Available: ${stock}, Requested: ${item.quantity}`);
                    }

                    // إضافة العنصر
                    const itemParams = [item.sale_id, item.product_id, item.quantity, item.unit_price, item.discount_amount, item.total_price];
                    console.log(`add-sale.js: تنفيذ استعلام إضافة العنصر ${index + 1} مع المعلمات:`, itemParams);
                    const itemStmt = dbInstance.prepare(
                        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, discount_amount, total_price) 
                         VALUES (?, ?, ?, ?, ?, ?);`,
                        itemParams
                    );
                    itemStmt.run();
                    const saleItemId = dbInstance.exec('SELECT last_insert_rowid() AS id;')[0].values[0][0];
                    itemStmt.free();
                    console.log(`add-sale.js: تم إضافة العنصر ${index + 1} بمعرف:`, saleItemId);

                    // تحديث المخزون
                    console.log(`add-sale.js: تحديث المخزون للمنتج ${productName} (ID: ${item.product_id}) بمقدار: -${item.quantity}`);
                    dbInstance.run('UPDATE products SET stock_quantity = stock_quantity - ? WHERE product_id = ?;', [item.quantity, item.product_id]);
                }

                // التحقق من العناصر المدرجة
                const insertedItemsStmt = dbInstance.prepare('SELECT * FROM sale_items WHERE sale_id = ?;', [saleId]);
                const insertedItems = [];
                while (insertedItemsStmt.step()) {
                    insertedItems.push(insertedItemsStmt.getAsObject());
                }
                insertedItemsStmt.free();
                console.log('add-sale.js: العناصر المدرجة:', insertedItems);

                dbInstance.run('COMMIT;');
                console.log('add-sale.js: تم تأكيد المعاملة');

                await db.save();
                console.log('add-sale.js: تم حفظ قاعدة البيانات في IndexedDB');

                window.location.href = 'sales.html';
            } catch (error) {
                dbInstance.run('ROLLBACK;');
                console.error('add-sale.js: خطأ أثناء المعاملة:', error.message, error.stack);
                alert('فشل تأكيد البيع: ' + error.message);
            }
        } catch (error) {
            console.error('add-sale.js: خطأ في الاتصال بقاعدة البيانات:', error.message, error.stack);
            alert('فشل الاتصال بقاعدة البيانات: ' + error.message);
        }
    });

    // تحميل البيانات عند بدء التشغيل
    console.log('add-sale.js: تحميل البيانات الأولية');
    await loadClients();
    await loadProducts();
    updateSummary();
});