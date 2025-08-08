import Database from '../database/Database.js';

const supabaseUrl = 'https://xlmphvxehdomywigsrhq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsbXBodnhlaGRvbXl3aWdzcmhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1NTkzNTYsImV4cCI6MjA3MDEzNTM1Nn0.jB3EniiBHHSD2nTkFrtTJm0wGT8r5tGEitHj_GNTVcg';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Function to show toast notification
function showToast(message, type = 'success') {
    console.log(`إنشاء إشعار: ${message}, نوع: ${type}`);
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    console.log('إضافة الإشعار إلى DOM');
    document.body.appendChild(toast);

    setTimeout(() => {
        console.log('إضافة فئة show');
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        console.log('إزالة فئة show');
        toast.classList.remove('show');
        setTimeout(() => {
            console.log('إزالة الإشعار من DOM');
            toast.remove();
        }, 300);
    }, 3000);
}

// Function to show loading spinner
function showLoading() {
    const spinner = document.getElementById('backup-spinner');
    const button = document.getElementById('backup-button');
    if (spinner) {
        console.log('إظهار مؤشر التحميل');
        spinner.classList.remove('hidden');
    }
    if (button) {
        console.log('تعطيل زر النسخ الاحتياطي');
        button.disabled = true;
        button.classList.add('opacity-50', 'cursor-not-allowed');
    }
}

// Function to hide loading spinner
function hideLoading() {
    const spinner = document.getElementById('backup-spinner');
    const button = document.getElementById('backup-button');
    if (spinner) {
        console.log('إخفاء مؤشر التحميل');
        spinner.classList.add('hidden');
    }
    if (button) {
        console.log('تفعيل زر النسخ الاحتياطي');
        button.disabled = false;
        button.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// Check if the device is online
async function isOnline() {
    if (!navigator.onLine) {
        console.log("❌ غير متصل بأي شبكة");
        showToast("غير متصل بالإنترنت", "error");
        return false;
    }

    try {
        // Fetch same-origin resource to avoid CORS
        const response = await fetch("/manifest.json", {
            method: "HEAD", // Lightweight request
            cache: "no-store",
            headers: {
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
        });

        if (response.ok) {
            console.log("✅ متصل بالإنترنت فعليًا");
            return true;
        } else {
            console.warn("⚠️ الاتصال غير مؤكد");
            showToast("الاتصال غير مؤكد", "warning");
            return false;
        }
    } catch (error) {
        console.warn("❌ فشل الاتصال بالإنترنت:", error.message);
        showToast("فشل الاتصال بالإنترنت", "error");
        return false;
    }
}

// Check if 24 hours have passed since the last backup
function is24HoursPassed() {
    const lastTime = localStorage.getItem('lastUploadTime');
    if (!lastTime) return true;

    const last = new Date(lastTime).getTime();
    const now = Date.now();
    const diffInMs = now - last;
    const hours = diffInMs / (1000 * 60 * 60);

    return hours >= 24;
}

// Initialize the database
async function initializeDB() {
    try {
        const db = new Database();
        await db.initializationPromise;
        return db;
    } catch (error) {
        console.error('❌ فشل تهيئة قاعدة البيانات:', error.message);
        showToast("فشل تهيئة قاعدة البيانات", "error");
        throw error;
    }
}

// Perform backup and upload to Supabase
async function manageBackup(manual = false) {
    const _online = await isOnline();
    if (!_online) {
        console.log('⚠️ لا يمكن إجراء النسخ الاحتياطي لعدم وجود اتصال بالإنترنت');
        return;
    }

    if (!is24HoursPassed()) {
        console.warn('⚠️ لا يمكنك تنفيذ العملية الآن. الرجاء المحاولة بعد مرور 24 ساعة.');
        showToast("النسخ الاحتياطي غير متاح الآن، حاول بعد 24 ساعة", "warning");
        return;
    }

    if (manual) showLoading(); // Show spinner only for manual backups
    const bucketName = 'jaber'; // Bucket ثابت

    try {
        // Initialize database and create backup
        let database;
        try {
            database = await initializeDB();
            const backupFile = await database.backup();
            console.log('✅ تم إنشاء ملف النسخ الاحتياطي:', backupFile.name);

            // Upload the backup file to Supabase
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(backupFile.name, backupFile, {
                    upsert: true,
                });

            if (uploadError) {
                console.error('❌ فشل رفع ملف النسخ الاحتياطي:', uploadError.message, uploadError);
                showToast("فشل رفع النسخ الاحتياطي", "error");
                throw new Error(`فشل رفع النسخ الاحتياطي: ${uploadError.message}`);
            } else {
                console.log('✅ تم رفع ملف النسخ الاحتياطي:', uploadData);
                localStorage.setItem('lastUploadTime', new Date().toISOString());
                showToast("تم حفظ النسخة الاحتياطية بنجاح!", "success");
            }
        } catch (error) {
            console.error('❌ فشل في إنشاء أو رفع النسخ الاحتياطي:', error.message, error);
            showToast("فشل في إنشاء النسخة الاحتياطية", "error");
            throw error;
        }
    } catch (error) {
        console.error('❌ خطأ عام في عملية النسخ الاحتياطي:', error.message, error);
        showToast("خطأ عام في النسخ الاحتياطي", "error");
    } finally {
        if (manual) hideLoading(); // Hide spinner only for manual backups
    }
}

// Schedule automatic backups every hour
function scheduleBackups() {
    setInterval(async () => {
        console.log('⏰ التحقق من إمكانية إجراء نسخ احتياطي تلقائي...');
        await manageBackup(false); // Automatic backups, no spinner
    }, 60 * 60 * 1000); // Check every hour
}

// Run the scheduler on script load
scheduleBackups();

// Trigger an immediate backup on script load (no spinner for automatic)
manageBackup(false);

// Export manageBackup for use in settings.js
export { manageBackup };