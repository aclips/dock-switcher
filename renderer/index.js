const projectsDiv = document.getElementById('projects');
const addProjectBtn = document.getElementById('addProject');

let settings = { projects: [] };

async function loadSettings() {
    settings = await window.electron.readSettings();
    reload();
}

async function reload() {
    const updatedSettings = await window.electron.checkRunningContainers();
    settings = updatedSettings;
    renderProjects();
}

function renderProjects() {
    projectsDiv.innerHTML = '';
    settings.projects.forEach((project) => {
        const projectDiv = document.createElement('div');
        projectDiv.className = 'project';

        const projectInfoDiv = document.createElement('div');
        projectInfoDiv.className = 'project-info';

        const statusIcon = document.createElement('span');
        statusIcon.innerHTML = project.isRunning
            ? '<i class="fas fa-check-circle" style="color: green;"></i>'
            : '<i class="fas fa-times-circle" style="color: red;"></i>';
        statusIcon.style.marginRight = '10px';

        const projectName = document.createElement('span');
        projectName.textContent = project.dockerComposeName;
        projectName.style.fontWeight = 'bold';

        const projectPath = document.createElement('span');
        projectPath.textContent = project.path;
        projectPath.style.display = 'block';
        projectPath.style.fontStyle = 'italic';

        projectInfoDiv.appendChild(statusIcon);
        projectInfoDiv.appendChild(projectName);
        projectInfoDiv.appendChild(projectPath);
        projectDiv.appendChild(projectInfoDiv);

        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'project-buttons';

        const startBtn = document.createElement('button');
        startBtn.innerHTML = '<i class="fas fa-play"></i>';
        startBtn.disabled = project.isRunning;
        startBtn.onclick = async () => {
            const command = `docker compose -p ${project.dockerComposeName} up -d`;
            try {
                // Отключаем кнопки и показываем индикатор загрузки
                startBtn.disabled = true;
                stopBtn.disabled = true;
                startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Иконка загрузки

                const response = await window.electron.runCommandUp(project.dockerComposeName, project.path);

                alert(response.message);
                reload();
            } catch (error) {
                alert(`Failed to start the project: ${error}`);
            } finally {
                // Восстанавливаем кнопки и скрываем индикатор загрузки
                startBtn.disabled = false;
                stopBtn.disabled = !project.isRunning;
                startBtn.innerHTML = '<i class="fas fa-play"></i>'; // Восстанавливаем иконку
            }
        };

        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '<i class="fas fa-stop"></i>';
        stopBtn.style.color = 'red';
        stopBtn.style.borderColor = 'red';
        stopBtn.disabled = !project.isRunning;
        stopBtn.onclick = async () => {
            const command = `docker compose -p ${project.dockerComposeName} down`;
            try {
                // Отключаем кнопки и показываем индикатор загрузки
                startBtn.disabled = true;
                stopBtn.disabled = true;
                stopBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Иконка загрузки

                await window.electron.runCommandDown(project.dockerComposeName, project.path);

                alert(`Project ${project.dockerComposeName} stopped successfully.`);
                reload();
            } catch (error) {
                alert(`Failed to stop the project: ${error}`);
            } finally {
                // Восстанавливаем кнопки и скрываем индикатор загрузки
                startBtn.disabled = false;
                stopBtn.disabled = !project.isRunning;
                stopBtn.innerHTML = '<i class="fas fa-stop"></i>'; // Восстанавливаем иконку
            }
        };

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';  // Используем иконку корзины
        removeBtn.onclick = async () => {
            const isConfirmed = window.confirm(`Are you sure you want to remove the project at ${project.path}?`);

            if (isConfirmed) {
                settings.projects = settings.projects.filter(p => p.path !== project.path);
                await window.electron.saveSettings(settings);
                reload();
            }
        };

        buttonsDiv.append(startBtn, stopBtn, removeBtn);

        projectDiv.appendChild(projectInfoDiv);
        projectDiv.appendChild(buttonsDiv);
        projectsDiv.appendChild(projectDiv);
    });
}

addProjectBtn.addEventListener('click', async () => {
    const folderPath = await window.electron.selectFolder();
    if (folderPath) {
        const hasContainers = await window.electron.checkDockerCompose(folderPath);
        if (hasContainers) {
            const dockerComposeName = await window.electron.getDockerComposeName(folderPath);
            settings.projects.push({
                path: folderPath,
                dockerComposeName: dockerComposeName || null,
            });
            await window.electron.saveSettings(settings);
            loadSettings();
        } else {
            alert('The docker compose file is missing or invalid.');
        }
    }
});

document.getElementById('reloadBtn').addEventListener('click', reload);

loadSettings();

// Получаем элементы
const modal = document.getElementById('authorModal');
const aboutAuthorLink = document.getElementById('aboutAuthor');
const closeModalButton = document.getElementById('closeModal');

// Открываем модальное окно при клике на ссылку
aboutAuthorLink.onclick = function() {
    modal.style.display = 'block';
};

// Закрываем модальное окно при клике на кнопку "×"
closeModalButton.onclick = function() {
    modal.style.display = 'none';
};

// Закрываем модальное окно, если пользователь кликает вне его области
window.onclick = function(event) {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};