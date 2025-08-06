import ClientsDB from '../database/ClientsDB.js';

document.addEventListener('DOMContentLoaded', async () => {
    // تهيئة قاعدة البيانات والحصول على عناصر الواجهة
    const clientsDB = new ClientsDB();
    const pageTitle = document.querySelector('h1');
    const clientNameInput = document.getElementById('clientName');
    const phoneInput = document.getElementById('phone');
    const addressInput = document.getElementById('address'); // حقل مضاف
    const isRegularSelect = document.getElementById('isRegular');
    const notesTextarea = document.getElementById('notes'); // حقل مضاف
    const submitButton = document.getElementById('addClient');
    const cancelButton = document.querySelector('a[href="clients.html"]');

    // التحقق من وجود معرّف العميل في الرابط لتحديد وضع التعديل
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    const isEditMode = clientId !== null;

    // دالة لتهيئة النموذج بناءً على وضع الإضافة أو التعديل
    const initializeForm = async () => {
        if (isEditMode) {
            pageTitle.textContent = 'تعديل بيانات العميل';
            submitButton.textContent = 'حفظ التعديلات';
            
            const client = await clientsDB.getClientById(clientId);
            if (client) {
                // ملء الحقول ببيانات العميل الحالية
                clientNameInput.value = client.name;
                phoneInput.value = client.phone || '';
                addressInput.value = client.address || '';
                isRegularSelect.value = client.is_regular ? '1' : '0';
                notesTextarea.value = client.notes || '';
            } else {
                alert('العميل غير موجود.');
                window.location.href = 'clients.html';
            }
        }
    };

    // معالج حدث النقر على زر الإضافة/الحفظ
    submitButton.addEventListener('click', async () => {
        const name = clientNameInput.value.trim();
        if (!name) {
            alert('يرجى إدخال اسم العميل.');
            clientNameInput.focus();
            return;
        }

        const clientData = {
            name: name,
            phone: phoneInput.value.trim() || null,
            address: addressInput.value.trim() || null,
            is_regular: isRegularSelect.value === '1',
            notes: notesTextarea.value.trim() || null
        };

        try {
            submitButton.disabled = true;
            cancelButton.style.pointerEvents = 'none'; // تعطيل زر الإلغاء أثناء الحفظ
            
            if (isEditMode) {
                await clientsDB.updateClient(clientId, clientData);
                alert('تم تحديث بيانات العميل بنجاح.');
            } else {
                await clientsDB.addClient(clientData);
                alert('تمت إضافة العميل بنجاح.');
            }
            window.location.href = 'clients.html';
        } catch (error) {
            console.error('Failed to save client:', error);
            alert('حدث خطأ أثناء حفظ بيانات العميل.');
            submitButton.disabled = false;
            cancelButton.style.pointerEvents = 'auto';
        }
    });

    // تشغيل دالة تهيئة النموذج عند تحميل الصفحة
    await initializeForm();
});