const loginBtn = document.querySelector('#loginBtn');
const passwordInput = document.querySelector('#passwordInput');
const savedPassword = localStorage.getItem('password');
const urlParams = new URLSearchParams(window.location.search);
const redirectURL = urlParams.get('redirect');
loginBtn.addEventListener('click', () => {
  const enteredPassword = passwordInput.value.trim();
  if (enteredPassword === "") {
    alert('الرجاء إدخال كلمة المرور.');
    return;
  }
  if (!savedPassword) {
    alert('لا توجد كلمة مرور محفوظة. الرجاء تعيين كلمة مرور أولاً.');
    return;
  }
  if (enteredPassword === savedPassword) {
    localStorage.setItem('isAuthenticated', 'true');
    if (redirectURL) {
      window.location.href = redirectURL;
    } else {
      alert("تم تسجيل الدخول بنجاح.");
    }
  } else {
    alert('كلمة المرور غير صحيحة. حاول مرة أخرى.');
  }
});