let goToLoadingPage = 0;
let ipcRenderer;
if (window && window.process && window.process.type === 'renderer') {
    ipcRenderer = require('electron').ipcRenderer;
}

async function checkSessionStatus() {
    while (goToLoadingPage === 0) {
        try {
            const sesIdStatCode = await ipcRenderer.invoke('get-session-id-status-code');
            console.log("The status is:",sesIdStatCode);
            if (sesIdStatCode === 200) {
                goToLoadingPage = 1;
                window.location.href = "./loading.html";
                console.log("no error i guess?");
            } else {
                console.log("Still in queue");
            }
        } catch (error) {
            console.error("Error getting status code!", error);
        }
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 1 second before checking again
    }
}

const cancelLoading = () => {
    // Send an IPC message to the main process to cancel loading
    goToLoadingPage = 1;
    ipcRenderer.send('cancel-loading-queue');
};

document.addEventListener('DOMContentLoaded', () => {
    goToLoadingPage = 0;
    checkSessionStatus();
    document.getElementById('cancelButton').addEventListener('click', cancelLoading);
});
