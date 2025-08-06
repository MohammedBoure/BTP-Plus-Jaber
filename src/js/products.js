import ProductsDB from '../database/ProductsDB.js';

document.addEventListener('DOMContentLoaded', async () => {
    const productsDB = new ProductsDB();
    const tableBody = document.getElementById('productsTableBody');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const searchTermInput = document.getElementById('searchTerm');
    const stockFilterSelect = document.getElementById('stockFilter');

    const renderProducts = (products) => {
        tableBody.innerHTML = '';
        if (products.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-gray-500 dark:text-gray-400">لا توجد منتجات تطابق معايير البحث.</td></tr>`;
            return;
        }

        products.forEach(product => {
            const isLowStock = product.stock_quantity <= product.min_stock_level;
            const statusClass = isLowStock ? 'text-danger' : 'text-success';
            const statusText = isLowStock ? 'مخزون منخفض' : 'متوفر';

            // FIX: Using icons for actions
            const row = `
                <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                    <td class="p-3 text-right">${product.product_id}</td>
                    <td class="p-3 font-medium text-gray-900 dark:text-white text-right">${product.name}</td>
                    <td class="p-3 text-right">${product.unit}</td>
                    <td class="p-3 text-left">${product.stock_quantity}</td>
                    <td class="p-3 text-left">${product.purchase_price.toFixed(2)} د.ج</td>
                    <td class="p-3 text-left">${product.price_per_unit.toFixed(2)} د.ج</td>
                    <td class="p-3 font-semibold ${statusClass} text-right">${statusText}</td>
                    <td class="p-3 text-left">
                        <div class="flex gap-2 justify-start">
                            <a href="add-product.html?id=${product.product_id}" class="p-2 rounded-md text-primary dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-700" title="تعديل">
                                <i data-lucide="edit-3" class="w-4 h-4"></i>
                            </a>
                            <button class="delete-btn p-2 rounded-md text-danger dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50" title="حذف" data-id="${product.product_id}">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', row);
        });
        
        // FIX: Must call this after injecting HTML with icons
        lucide.createIcons();
    };

    const loadAndRenderProducts = async () => {
        const searchTerm = searchTermInput.value.trim().toLowerCase();
        const stockStatus = stockFilterSelect.value;
        let products = await productsDB.getAllProducts();
        if (stockStatus === 'low') {
            products = products.filter(p => p.stock_quantity <= p.min_stock_level);
        } else if (stockStatus === 'normal') {
            products = products.filter(p => p.stock_quantity > p.min_stock_level);
        }
        if (searchTerm) {
            products = products.filter(p => p.name.toLowerCase().includes(searchTerm));
        }
        products.sort((a, b) => b.product_id - a.product_id);
        renderProducts(products);
    };

    applyFiltersBtn.addEventListener('click', loadAndRenderProducts);
    searchTermInput.addEventListener('keyup', (event) => { if (event.key === 'Enter') loadAndRenderProducts(); });

    tableBody.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const productId = deleteBtn.dataset.id;
            if (confirm('هل أنت متأكد من رغبتك في حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.')) {
                try {
                    await productsDB.deleteProduct(productId);
                    await loadAndRenderProducts();
                } catch (error) {
                    console.error('Failed to delete product:', error);
                    alert('فشل حذف المنتج. قد يكون مرتبطًا بسجلات مبيعات.');
                }
            }
        }
    });

    loadAndRenderProducts();
});