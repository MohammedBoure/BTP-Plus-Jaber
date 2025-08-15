import ProductsDB from '../database/ProductsDB.js';

document.addEventListener('DOMContentLoaded', async () => {
    const productsDB = new ProductsDB();
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const isEditMode = productId !== null;

    // الحصول على عناصر الواجهة
    const pageTitle = document.getElementById('page-title');
    const mainHeading = document.getElementById('main-heading');
    const submitBtn = document.getElementById('submit-btn');
    const nameInput = document.getElementById('name');
    const unitInput = document.getElementById('unit');
    const stockQuantityInput = document.getElementById('stock_quantity');
    const minStockLevelInput = document.getElementById('min_stock_level');
    const purchasePriceInput = document.getElementById('purchase_price');
    const pricePerUnitInput = document.getElementById('price_per_unit');

    // إعداد الواجهة بناءً على الوضع (إضافة أو تعديل)
    if (isEditMode) {
        // --- وضع التعديل ---
        pageTitle.textContent = 'تعديل المنتج';
        mainHeading.textContent = 'تعديل المنتج';
        submitBtn.textContent = 'حفظ التعديلات';
        submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
        submitBtn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');

        // جلب بيانات المنتج وتعبئة الحقول
        const product = await productsDB.getProductById(productId);
        if (product) {
            nameInput.value = product.name;
            unitInput.value = product.unit;
            stockQuantityInput.value = product.stock_quantity;
            minStockLevelInput.value = product.min_stock_level;
            purchasePriceInput.value = product.purchase_price;
            pricePerUnitInput.value = product.price_per_unit;
        } else {
             mainHeading.textContent = 'منتج غير موجود';
             document.querySelector('.grid').style.display = 'none';
        }
    } 
    // لا حاجة لكتلة else، فالقيم الافتراضية في HTML هي لوضع الإضافة

    // معالجة حدث الضغط على زر الحفظ
    submitBtn.addEventListener('click', async () => {
        const productData = {
            name: nameInput.value,
            unit: unitInput.value,
            stock_quantity: parseInt(stockQuantityInput.value, 10),
            min_stock_level: parseInt(minStockLevelInput.value, 10),
            purchase_price: parseFloat(purchasePriceInput.value),
            price_per_unit: parseFloat(pricePerUnitInput.value)
        };

        if (!productData.name || !productData.unit || isNaN(productData.stock_quantity)) {
            alert('يرجى ملء الحقول المطلوبة بشكل صحيح.');
            return;
        }

        try {
            if (isEditMode) {
                // تحديث المنتج الحالي
                await productsDB.updateProduct(productId, productData);
            } else {
                // إضافة منتج جديد
                await productsDB.addProduct(productData);
            }
            window.location.href = 'products.html'; // العودة إلى صفحة المنتجات
        } catch (error) {
            console.error('Error saving product:', error);
            alert('حدث خطأ أثناء حفظ المنتج.');
        }
    });
});