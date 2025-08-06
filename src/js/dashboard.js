import ProductsDB from '../database/ProductsDB.js';
import SaleItemsDB from '../database/SaleItemsDB.js';
import ClientsDB from '../database/ClientsDB.js';
import PaymentsDB from '../database/PaymentsDB.js';
import SalesDB from '../database/SalesDB.js';

// Store chart instances
let financialChartInstance = null;
let topProductsChartInstance = null;
let revenueTrendChartInstance = null;

// Define theme colors to use in charts
const THEME_COLORS = {
    primary: '#1E3A8A',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    pie: ['#1E3A8A', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#F472B6']
};

// Make it globally accessible for theme switching
window.fetchStatsManually = async function() {
    const startDate = toYYYYMMDD(document.getElementById('startDate')?.value);
    const endDate = toYYYYMMDD(document.getElementById('endDate')?.value);
    fetchStats(startDate, endDate);
}

// Date Range Button Handlers
document.getElementById('todayBtn').addEventListener('click', () => setDateRange('today'));
document.getElementById('lastWeekBtn').addEventListener('click', () => setDateRange('lastWeek'));
document.getElementById('lastMonthBtn').addEventListener('click', () => setDateRange('lastMonth'));
document.getElementById('lastYearBtn').addEventListener('click', () => setDateRange('lastYear'));
document.getElementById('allDataBtn').addEventListener('click', () => setDateRange('allData'));
document.getElementById('fetchStats').addEventListener('click', fetchStatsManually);

// Date format conversion (YYYY-MM-DD to MM/DD/YYYY and vice versa)
function toMMDDYYYY(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
}

function toYYYYMMDD(dateStr) {
    if (!dateStr) return '';
    const [month, day, year] = dateStr.split('/');
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function setDateRange(range) {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const today = new Date();

    const formatLocalDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    let startDate, endDate;
    switch (range) {
        case 'today':
            startDate = endDate = formatLocalDate(today);
            break;
        case 'lastWeek':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
            startDate = formatLocalDate(startDate);
            endDate = formatLocalDate(today);
            break;
        case 'lastMonth':
            startDate = new Date(today);
            startDate.setMonth(today.getMonth() - 1);
            startDate = formatLocalDate(startDate);
            endDate = formatLocalDate(today);
            break;
        case 'lastYear':
            startDate = new Date(today);
            startDate.setFullYear(today.getFullYear() - 1);
            startDate = formatLocalDate(startDate);
            endDate = formatLocalDate(today);
            break;
        case 'allData':
            startDate = '';
            endDate = '';
            break;
    }

    if (startDateInput) startDateInput.value = toMMDDYYYY(startDate);
    if (endDateInput) endDateInput.value = toMMDDYYYY(endDate);
    fetchStats(startDate, endDate);
}

async function fetchStats(startDate, endDate) {
    try {
        if (!window.initSqlJs) {
            throw new Error('SQL.js لم يتم تحميله بعد. تأكد من تضمين sql-wasm.js.');
        }
        const stats = await getComprehensiveStats(startDate, endDate);
        displayStats(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        alert('فشل في جلب الإحصائيات: ' + error.message);
    }
}

async function getComprehensiveStats(startDate, endDate) {
    const saleItemsDB = new SaleItemsDB();
    const productsDB = new ProductsDB();
    const clientsDB = new ClientsDB();
    const paymentsDB = new PaymentsDB();
    const salesDB = new SalesDB();

    try {
        if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) ||
            (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
            throw new Error('صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD.');
        }

        // Sales Stats
        const totalRevenue = await saleItemsDB.getTotalRevenue(startDate, endDate);
        const topSoldItems = await saleItemsDB.getTopSoldItemsWithDateRange(startDate, endDate, 5);
        const totalItemsSold = await saleItemsDB.getTotalItemsSold(startDate, endDate);
        const revenueTrend = await getRevenueTrend(saleItemsDB, startDate, endDate);

        // Calculate Total Purchase Cost of sold items accurately
        const db = await saleItemsDB.getDB();
        let query = `SELECT si.product_id, SUM(si.quantity) as total_quantity
                     FROM sale_items si
                     JOIN sales s ON si.sale_id = s.sale_id`;
        const params = [];
        if (startDate && endDate) {
            query += ` WHERE s.date BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        } else if (startDate) {
            query += ` WHERE s.date >= ?`;
            params.push(startDate);
        } else if (endDate) {
            query += ` WHERE s.date <= ?`;
            params.push(endDate);
        }
        query += ` GROUP BY si.product_id;`;
        const stmt = db.prepare(query, params);
        let totalPurchaseCost = 0;
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const product = await productsDB.getProductById(row.product_id);
            if (product) {
                totalPurchaseCost += product.purchase_price * row.total_quantity;
            }
        }
        stmt.free();

        // Products Stats
        const totalProductsCount = await productsDB.getTotalProductsCount();
        const lowStockProductsCount = await productsDB.getLowStockProductsCount();
        const totalCapitalPurchase = await productsDB.getTotalCapitalPurchasePrice();
        const totalCapitalSell = await productsDB.getTotalCapitalSellPrice();
        const unsoldProducts = await productsDB.getUnsoldProductsSince(startDate || '1970-01-01');

        // Clients Stats
        const totalClientsCount = await clientsDB.getTotalClientsCount();
        const topSpendingClients = await clientsDB.getTopSpendingClients(5, startDate, endDate);
        const clientsWithCredit = await clientsDB.getClientsWithCredit();

        // Payments Stats
        const totalPayments = await paymentsDB.getTotalPaymentsAmount(startDate, endDate);

        // Simplified Profit Calculation
        const grossProfit = totalRevenue - totalPurchaseCost;

        return {
            sales: { totalRevenue, topSoldItems: topSoldItems.map(item => ({...item, total_revenue: item.total_revenue})), totalItemsSold },
            products: { totalProductsCount, lowStockProductsCount, totalCapitalPurchase, totalCapitalSell, unsoldProducts },
            clients: { totalClientsCount, topSpendingClients, clientsWithCredit },
            payments: { totalPayments },
            profit: { grossProfit },
            revenueTrend
        };
    } catch (error) {
        console.error('Error in getComprehensiveStats:', error.message, error.stack);
        throw new Error(`فشل في جلب الإحصائيات: ${error.message}`);
    }
}

async function getRevenueTrend(saleItemsDB, startDate, endDate) {
    const db = await saleItemsDB.getDB();
    let query = `SELECT DATE(s.date) as date, SUM(si.total_price) as daily_revenue
                 FROM sales s
                 JOIN sale_items si ON s.sale_id = si.sale_id`;
    const params = [];
    if (startDate && endDate) {
        query += ` WHERE s.date BETWEEN ? AND ?`;
        params.push(startDate, endDate);
    }
    query += ` GROUP BY DATE(s.date) ORDER BY s.date;`;
    const stmt = db.prepare(query, params);
    const trend = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        trend.push({ date: toMMDDYYYY(row.date), daily_revenue: row.daily_revenue });
    }
    stmt.free();
    return trend;
}

function displayStats(stats) {
    const setTextContent = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    };

    const setClassName = (id, condition, trueClass, falseClass = 'font-medium') => {
        const element = document.getElementById(id);
        if (element) {
            element.className = condition ? `font-medium ${trueClass}` : `font-medium ${falseClass}`;
        }
    };

    // Sales & Payments Stats
    setTextContent('totalRevenue', stats.sales.totalRevenue.toFixed(2));
    setTextContent('totalPayments', stats.payments.totalPayments.toFixed(2));
    setTextContent('totalItemsSold', stats.sales.totalItemsSold.toFixed(2));
    const topSoldItemsList = document.getElementById('topSoldItems');
    if (topSoldItemsList) {
        topSoldItemsList.innerHTML = '';
        stats.sales.topSoldItems.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item.product_name}: ${item.total_revenue.toFixed(2)} دينار`;
            topSoldItemsList.appendChild(li);
        });
    }

    // Products Stats
    setTextContent('totalProductsCount', stats.products.totalProductsCount);
    setTextContent('lowStockProductsCount', stats.products.lowStockProductsCount);
    if (document.getElementById('lowStockProductsCount')) {
        document.getElementById('lowStockProductsCount').className = stats.products.lowStockProductsCount > 0 ? 'font-medium text-danger' : 'font-medium';
    }
    setTextContent('totalCapitalPurchase', stats.products.totalCapitalPurchase.toFixed(2));
    setTextContent('totalCapitalSell', stats.products.totalCapitalSell.toFixed(2));
    const unsoldProductsList = document.getElementById('unsoldProducts');
    if (unsoldProductsList) {
        unsoldProductsList.innerHTML = '';
        stats.products.unsoldProducts.forEach(product => {
            const li = document.createElement('li');
            li.textContent = `${product.name}: ${product.stock_quantity} وحدة`;
            unsoldProductsList.appendChild(li);
        });
    }

    // Clients Stats
    setTextContent('totalClientsCount', stats.clients.totalClientsCount);
    const topSpendingClientsList = document.getElementById('topSpendingClients');
    if (topSpendingClientsList) {
        topSpendingClientsList.innerHTML = '';
        stats.clients.topSpendingClients.forEach(client => {
            const li = document.createElement('li');
            li.textContent = `${client.name}: ${client.total_spent.toFixed(2)} دينار`;
            topSpendingClientsList.appendChild(li);
        });
    }
    const clientsWithCreditList = document.getElementById('clientsWithCredit');
    if (clientsWithCreditList) {
        clientsWithCreditList.innerHTML = '';
        stats.clients.clientsWithCredit.forEach(client => {
            const li = document.createElement('li');
            li.textContent = `${client.name}: ${client.total_remaining.toFixed(2)} دينار`;
            topSpendingClientsList.appendChild(li);
        });
    }

    // Profit Stats
    setTextContent('grossProfit', stats.profit.grossProfit.toFixed(2));
    setClassName('grossProfit', stats.profit.grossProfit < 0, 'text-danger', 'text-success');
    
    drawCharts(stats);
}

function drawCharts(stats) {
    if (financialChartInstance) financialChartInstance.destroy();
    if (topProductsChartInstance) topProductsChartInstance.destroy();
    if (revenueTrendChartInstance) revenueTrendChartInstance.destroy();

    const isDarkMode = document.documentElement.classList.contains('dark');
    const textColor = isDarkMode ? '#d1d5db' : '#4b5563';
    const gridColor = isDarkMode ? '#374151' : '#e5e7eb';
    const titleColor = isDarkMode ? '#f9fafb' : '#111827';

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: textColor, font: { family: "'Inter', 'Noto Sans Arabic', sans-serif" } } },
            tooltip: { titleFont: { family: "'Inter', 'Noto Sans Arabic', sans-serif" }, bodyFont: { family: "'Inter', 'Noto Sans Arabic', sans-serif" } },
            title: { display: true, color: titleColor, font: { size: 16, family: "'Inter', 'Noto Sans Arabic', sans-serif" } }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor }, title: { display: true, text: 'القيمة (دينار)', color: textColor } },
            x: { grid: { color: gridColor }, ticks: { color: textColor }, title: { display: true, color: textColor } }
        }
    };
    
    // Financial Chart (Bar) - Simplified
    financialChartInstance = new Chart(document.getElementById('financialChart'), {
        type: 'bar',
        data: {
            labels: ['المدخول الكلي ', 'الربح الإجمالي'],
            datasets: [{
                label: 'القيمة (دينار)',
                data: [ stats.sales.totalRevenue, stats.profit.grossProfit ],
                backgroundColor: [
                    THEME_COLORS.primary,
                    stats.profit.grossProfit < 0 ? THEME_COLORS.danger : THEME_COLORS.success
                ],
                borderRadius: 4,
                borderWidth: 0
            }]
        },
        options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, legend: { display: false }, title: { ...commonOptions.plugins.title, text: ' ' } },
            scales: { ...commonOptions.scales, x: { ...commonOptions.scales.x, title: { ...commonOptions.scales.x.title, text: '' } } }
        }
    });

    // Top Products Chart (Pie)
    topProductsChartInstance = new Chart(document.getElementById('topProductsChart'), {
        type: 'pie',
        data: {
            labels: stats.sales.topSoldItems.map(item => item.product_name),
            datasets: [{
                label: 'الإيرادات',
                data: stats.sales.topSoldItems.map(item => item.total_revenue),
                backgroundColor: THEME_COLORS.pie,
                borderColor: isDarkMode ? '#1f2937' : '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                ...commonOptions.plugins,
                title: { ...commonOptions.plugins.title, text: ' ' },
                legend: { ...commonOptions.plugins.legend, position: 'right' },
                tooltip: { ...commonOptions.plugins.tooltip, callbacks: { label: context => `${context.label}: ${context.parsed.toFixed(2)} دينار` } },
                datalabels: {
                    formatter: (value, ctx) => {
                        const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        const percentage = sum > 0 ? (value * 100 / sum).toFixed(1) + "%" : "0%";
                        return percentage;
                    },
                    color: '#fff',
                    font: { weight: 'bold' }
                }
            },
            scales: { y: { display: false }, x: { display: false } }
        },
        plugins: [ChartDataLabels]
    });

    // Revenue Trend Chart (Line)
    revenueTrendChartInstance = new Chart(document.getElementById('revenueTrendChart'), {
        type: 'line',
        data: {
            labels: stats.revenueTrend.map(item => item.date),
            datasets: [{
                label: 'المدخول اليومي',
                data: stats.revenueTrend.map(item => item.daily_revenue),
                borderColor: THEME_COLORS.primary,
                backgroundColor: isDarkMode ? 'rgba(30, 58, 138, 0.3)' : 'rgba(30, 58, 138, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            ...commonOptions,
            plugins: { ...commonOptions.plugins, title: { ...commonOptions.plugins.title, text: ' ' } },
            scales: { ...commonOptions.scales, x: { ...commonOptions.scales.x, grid: { display: false }, title: { ...commonOptions.scales.x.title, text: 'التاريخ' } } }
        }
    });
}

// Initialize with All Data
setDateRange('allData');