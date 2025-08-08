document.addEventListener('DOMContentLoaded', () => {
    console.log('print-receipt.js: بدء تهيئة زر الطباعة');

    // الوصول إلى زر الطباعة
    const printButton = document.getElementById('printReceipt');
    if (!printButton) {
        console.error('print-receipt.js: زر الطباعة غير موجود في DOM');
        alert('خطأ في تحميل الصفحة: زر الطباعة غير موجود');
        return;
    }
    console.log('print-receipt.js: تم العثور على زر الطباعة في DOM');

    // دالة لإرسال النص إلى الطابعة
    async function sendToPrinter(receiptText) {
        try {
            console.log('print-receipt.js: إرسال النص إلى الطابعة');
            console.log('print-receipt.js: نص الإيصال المرسل:', receiptText);
            const payload = { message: receiptText }; // Changed from 'content' to 'message' to match Flask API
            console.log('print-receipt.js: JSON المرسل:', JSON.stringify(payload, null, 2));
            
            const response = await fetch('http://127.0.0.1:5000/print', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('print-receipt.js: استجابة الخطأ من الخادم:', errorText);
                throw new Error(`فشل الاتصال بخادم الطباعة: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('print-receipt.js: تم إرسال النص للطباعة بنجاح', result);
            alert(result.status || 'تم إرسال الإيصال للطباعة بنجاح');
        } catch (error) {
            console.error('print-receipt.js: خطأ في الطباعة:', error.message);
            alert(`فشل الطباعة: ${error.message}`);
        }
    }

    // دالة لتوليد نص الإيصال
    function generateReceiptText() {
        console.log('print-receipt.js: Génération du texte du reçu');

        // --- 1. Récupération des éléments du DOM ---
        const selectClient = document.getElementById('clientSelect');
        const dateVente = document.getElementById('saleDate');
        const estCredit = document.getElementById('isCredit');
        const remiseVente = document.getElementById('saleDiscount');
        const fraisLivraison = document.getElementById('deliveryPrice');
        const corpsTableauArticles = document.getElementById('saleItemsTableBody');
        const affichageSousTotal = document.getElementById('subtotal');
        const affichageTotal = document.getElementById('total');
        const inputMontantPaye = document.getElementById('paidAmount');
        const affichageReste = document.getElementById('remaining');

        if (!selectClient || !dateVente || !estCredit || !remiseVente || !fraisLivraison ||
            !corpsTableauArticles || !affichageSousTotal || !affichageTotal ||
            !inputMontantPaye || !affichageReste) {
            console.error('Un ou plusieurs éléments du DOM sont manquants.');
            alert('Erreur : Un des éléments de la page est introuvable.');
            return null;
        }

        // --- 2. Extraction des données ---
        const nomClient = selectClient.selectedOptions[0]?.textContent.split(' (')[0] || 'Vente au comptant';
        const date = dateVente.value || new Date().toISOString().split('T')[0];
        const estCreditValeur = parseInt(estCredit.value) || 0;
        const remiseVenteValeur = parseFloat(remiseVente.value) || 0;
        const fraisLivraisonValeur = parseFloat(fraisLivraison.value) || 0;
        const sousTotal = parseFloat(affichageSousTotal.textContent) || 0;
        const total = parseFloat(affichageTotal.textContent) || 0;
        const montantPaye = parseFloat(inputMontantPaye.value) || 0;
        const resteAPayer = parseFloat(affichageReste.textContent) || 0;

        const articlesVendus = Array.from(corpsTableauArticles.children).map(row => ({
            nomProduit: row.cells[0]?.textContent.trim() || 'Inconnu',
            quantite: parseFloat(row.cells[1]?.textContent) || 0,
            prixUnitaire: parseFloat(row.cells[2]?.textContent) || 0,
            remise: parseFloat(row.cells[3]?.textContent) || 0,
            total: parseFloat(row.cells[4]?.textContent) || 0
        }));

        if (articlesVendus.length === 0) {
            console.error('Aucun article dans la vente.');
            alert('Veuillez ajouter au moins un produit.');
            return null;
        }

        // --- 3. Génération du reçu ---
        const numeroRecu = `${date.replace(/-/g, '')}-001`;
        const ligneSeparatrice = '-'.repeat(40);
        let texteRecu = '';

        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `        Société Matériaux Idéale\n`;
        texteRecu += ` Adresse: Jijel, Chekfa, Boughatene\n`;
        texteRecu += `         Tél: 0558815453\n`;
        texteRecu += `       N° Reçu: ${numeroRecu}\n`;
        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `Date: ${date}\n`;
        texteRecu += `Client: ${nomClient}\n`;
        texteRecu += `Vente: ${estCreditValeur ? 'Crédit' : 'Comptant'}\n`;
        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `Produit          Qté  PU     Rem   Total\n`;
        texteRecu += `${ligneSeparatrice}\n`;

        articlesVendus.forEach(item => {
            const nom = item.nomProduit.padEnd(15).slice(0, 15);
            const qte = item.quantite.toString().padStart(3);
            const pu = item.prixUnitaire.toFixed(0).padStart(6);
            const rem = item.remise.toFixed(0).padStart(4);
            const tot = item.total.toFixed(0).padStart(7);
            texteRecu += `${nom} ${qte} ${pu} ${rem} ${tot}\n`;
        });

        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += `Sous-total:         ${sousTotal.toFixed(2)} DA\n`;
        if (remiseVenteValeur > 0)
            texteRecu += `Remise:             ${remiseVenteValeur.toFixed(2)} DA\n`;
        if (fraisLivraisonValeur > 0)
            texteRecu += `Livraison:          ${fraisLivraisonValeur.toFixed(2)} DA\n`;
        texteRecu += `TOTAL:              ${total.toFixed(2)} DA\n`;
        texteRecu += `Payé:               ${montantPaye.toFixed(2)} DA\n`;
        if (estCreditValeur)
            texteRecu += `Reste:              ${resteAPayer.toFixed(2)} DA\n`;

        texteRecu += `${ligneSeparatrice}\n`;
        texteRecu += ` Merci pour votre confiance !\n`;
        texteRecu += ` [Cachet de l'entreprise]\n`;
        texteRecu += `${ligneSeparatrice}`;

        console.log('Texte du reçu généré :\n', texteRecu);
        return texteRecu;
    }

    // التعامل مع النقر على زر الطباعة
    printButton.addEventListener('click', () => {
        console.log('print-receipt.js: النقر على زر الطباعة');
        const saleItemsTableBody = document.getElementById('saleItemsTableBody');
        if (!saleItemsTableBody || saleItemsTableBody.children.length === 0) {
            console.error('print-receipt.js: لا توجد عناصر مبيعات للطباعة');
            alert('يرجى إضافة منتج واحد على الأقل قبل الطباعة.');
            return;
        }

        const receiptText = generateReceiptText();
        if (receiptText) {
            sendToPrinter(receiptText);
        }
    });
});