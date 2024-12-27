const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Путь для хранения настроек, используя userData для доступа к файлам
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

let mainWindow;

app.disableHardwareAcceleration();

// Функция для проверки установки Docker и Docker Compose
async function checkDockerInstallation() {
    return new Promise((resolve, reject) => {
        exec('command -v docker', (error, stdout) => {
            if (error || !stdout) {
                reject('Docker is not installed');
            } else {
                exec('command -v docker-compose', (error2, stdout2) => {
                    if (error2 || !stdout2) {
                        reject('docker-compose is not installed');
                    } else {
                        resolve('Docker and docker-compose are installed');
                    }
                });
            }
        });
    });
}

// Вызываем проверку при старте приложения
async function initializeApp() {
    try {
        await checkDockerInstallation();  // Проверка Docker перед запуском приложения
        await ensureSettingsFileExists();

        mainWindow = new BrowserWindow({
            width: 800,
            height: 865,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
            },
            autoHideMenuBar: true,
            icon: path.join(__dirname, 'assets', 'icons', 'icon.png')  // Путь к иконке
        });

        mainWindow.setMenuBarVisibility(false);
        mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    } catch (error) {
        console.error(error);
        app.quit();  // Закрываем приложение, если Docker не установлен
    }
}

app.whenReady().then(initializeApp);

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    return result.filePaths[0] || null;
});

async function getDockerComposeName(projectPath) {
    return new Promise((resolve, reject) => {
        exec('docker compose config', { cwd: projectPath }, (error, stdout) => {
            if (error) {
                reject(`Error running docker compose config: ${error.message}`);
            } else {
                const matches = stdout.match(/name:\s*(\S+)/);
                resolve(matches ? matches[1] : null);
            }
        });
    });
}

ipcMain.handle('read-settings', async () => {
    const settings = await readSettingsFile();
    for (const project of settings.projects) {
        try {
            project.dockerComposeName = await getDockerComposeName(project.path);
        } catch (error) {
            console.error(error);
            project.dockerComposeName = null;
        }
    }
    await saveSettings(settings);
    return settings;
});

ipcMain.handle('save-settings', async (_, settings) => {
    try {
        await saveSettings(settings);
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
});

ipcMain.handle('check-docker-compose', async (_, folderPath) => {
    return new Promise((resolve) => {
        exec('docker compose config', { cwd: folderPath }, (error, stdout) => {
            resolve(!error && stdout.includes('services:'));
        });
    });
});

ipcMain.handle('check-running-containers', async () => {
    const settings = await readSettingsFile();
    const runningContainers = await getRunningContainers();
    settings.projects.forEach((project) => {
        project.isRunning = runningContainers.includes(project.dockerComposeName);
    });
    await saveSettings(settings);
    return settings;
});

ipcMain.handle('get-docker-compose-name', async (_, folderPath) => {
    try {
        return await getDockerComposeName(folderPath);
    } catch (error) {
        console.error('Error fetching docker compose name:', error);
        return null;
    }
});

ipcMain.handle('run-command-up', async (_, name, workingDirectory) => {
    try {
        // Сначала выполняем команду build
        const commandBuild = `docker compose -p ${name} build`;
        await runDockerCommand(commandBuild, workingDirectory);
    } catch (error) {
        // Пропускаем ошибку в build и продолжаем с up
        console.error(`Build command failed for project ${name}, continuing with up.`);
    }

    try {
        // Выполняем команду up
        const commandUp = `docker compose -p ${name} up -d`;
        await runDockerCommand(commandUp, workingDirectory);

        // Возвращаем успешный результат
        return { success: true, message: `Project ${name} started successfully.` };
    } catch (error) {
        // Логируем ошибку и возвращаем сообщение о неудаче
        console.error(`Failed to start project ${name}:`, error);
        const commandDown = `docker compose -p ${name} down`;
        await runDockerCommand(commandDown, workingDirectory);

        return { success: false, message: `Failed to start project ${name}: ${error.message || error}` };
    }
});

ipcMain.handle('run-command-down', async (_, name, workingDirectory) => {
    const command = `docker compose -p ${name} down`;
    try {
        await runDockerCommand(command, workingDirectory);
        return { success: true, message: `Project ${name} stopped successfully.` };
    } catch (error) {
        return { success: false, message: `Failed to stop project ${name}: ${error}` };
    }
});

// Общая функция для запуска команды Docker (с проверкой доступности docker-compose)
async function runDockerCommand(command, workingDirectory) {
    const dockerCommand = await getDockerCommand();
    const fullCommand = command.replace('docker compose', dockerCommand);  // Меняем на правильную команду

    return new Promise((resolve, reject) => {
        exec(fullCommand, { cwd: workingDirectory }, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout);
            }
        });
    });
}

// Функция для проверки доступности команды docker-compose
function getDockerCommand() {
    return new Promise((resolve) => {
        exec('command -v docker-compose', (error, stdout) => {
            if (error || !stdout) {
                resolve('docker compose');  // Если команда docker-compose не найдена, используем docker compose
            } else {
                resolve('docker-compose');  // Если команда найдена, используем docker-compose
            }
        });
    });
}

async function getRunningContainers() {
    return new Promise((resolve, reject) => {
        exec('docker compose ls -q', (error, stdout) => {
            if (error) {
                reject(error.message);
            } else {
                resolve(stdout.split('\n').filter(Boolean));
            }
        });
    });
}

async function saveSettings(settings) {
    try {
        await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error saving settings:', error);
        throw error;
    }
}

// Чтение настроек из файла
async function readSettingsFile() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const settings = await fs.promises.readFile(SETTINGS_PATH, 'utf-8');
            return JSON.parse(settings);
        }
        return { projects: [] };  // Возвращаем пустой объект, если файл не существует
    } catch (error) {
        console.error('Error reading settings:', error);
        return { projects: [] };
    }
}

// Проверка и создание файла настроек, если он не существует
async function ensureSettingsFileExists() {
    if (!fs.existsSync(SETTINGS_PATH)) {
        const defaultSettings = { projects: [] };
        await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2), 'utf-8');
    }
}
