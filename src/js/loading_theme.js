(function() {
    let savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
    savedTheme = 'light'; // الافتراضي
    }
    if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
    } else {
    document.documentElement.classList.remove('dark');
    }
})();
