let ipcRenderer;
if (window && window.process && window.process.type === 'renderer') {
    ipcRenderer = require('electron').ipcRenderer;
}
const errorMessage = document.getElementById('errorMessage');

const handleSubmit = async (e) => {
    e.preventDefault();

    const email = document.getElementById('eMail').value;
    const password = document.getElementById('password').value;

    try {
        ipcRenderer.send('login-attempt', { email, password });
    } catch (error) {
        console.error('Error during login:', error);
        errorMessage.textContent = 'An unexpected error occurred. Please try again later.';
        errorMessage.style.display = 'block';
    }
};

document.getElementById('loginForm').addEventListener('submit', handleSubmit);

ipcRenderer.on('login-response', (event, response) => {
    if (response.success) {
        window.location.href = './mainpage.html';
    } else {
        errorMessage.textContent = response.errorMessage || 'An unexpected error occurred. Please try again later.';
        errorMessage.style.display = 'block';
    }
});