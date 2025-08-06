import Database from '../database/Database.js';

async function initializeDB() {
    try {
        const db = new Database();
        await db.initializationPromise; // Ensure database is fully initialized
        return db;
    } catch (error) {
        console.error('Error initializing Database:', error);
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    let database;
    try {
        database = await initializeDB();
    } catch (error) {
        alert('فشل في تهيئة قاعدة البيانات');
        return;
    }

    // Setup backup button
    const backupButton = document.getElementById('backup-button');
    if (backupButton) {
        backupButton.addEventListener('click', async () => {
            try {
                const file = await database.backup();
                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                URL.revokeObjectURL(url);
                alert('تم إنشاء النسخة الاحتياطية بنجاح');
            } catch (error) {
                console.error('Error creating backup:', error);
                alert('فشل في إنشاء النسخة الاحتياطية: ' + error.message);
            }
        });
    }

    // Setup restore button
    const restoreInput = document.getElementById('restore-input');
    if (restoreInput) {
        restoreInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                try {
                    await database.restore(file);
                    alert('تم استعادة قاعدة البيانات بنجاح');
                    window.location.reload(); // Reload to reflect changes
                } catch (error) {
                    console.error('Error restoring database:', error);
                    alert('فشل في استعادة قاعدة البيانات: ' + error.message);
                }
            }
        });
    }

    // Setup delete button
    const deleteButton = document.getElementById('delete-button');
    if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
            if (confirm('هل أنت متأكد من حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه.')) {
                try {
                    await database.deleteAllData();
                    // Reinitialize the database to ensure it's empty
                    database = new Database();
                    await database.initializationPromise;
                    await database.getDB(); // Ensure tables are recreated
                    alert('تم حذف جميع البيانات بنجاح');
                    window.location.reload(); // Reload to reflect empty state
                } catch (error) {
                    console.error('Error deleting all data:', error);
                    alert('فشل في حذف البيانات: ' + error.message);
                }
            }
        });
    }

    // Setup password form
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        // Load existing password from localStorage
        const storedPassword = localStorage.getItem('password');
        if (storedPassword) {
            document.getElementById('password').value = storedPassword;
        }

        passwordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = document.getElementById('password').value;

            try {
                if (password === '') {
                    // Clear both if password is empty
                    localStorage.removeItem('password');
                    localStorage.removeItem('isAuthenticated');
                    alert('تم حذف كلمة المرور بنجاح');
                } else {
                    // Save both separately
                    localStorage.setItem('password', password);
                    localStorage.setItem('isAuthenticated', 'true');
                    alert('تم تحديث كلمة المرور بنجاح');
                }
            } catch (error) {
                console.error('Error saving password:', error);
                alert('فشل في تحديث كلمة المرور: ' + error.message);
            }
        });
    }

});