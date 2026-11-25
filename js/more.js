// More / Settings Tab for Diário de Bordo
import { exportFullBackup, importFullBackup, clearAllData, getStorageEstimate, toDateKey } from './db.js';
import { ICONS } from './icons.js';

export async function renderMoreTab(container, { entriesCount, gratitudeCount = 0, pwaInstallEvent, isStandalone, onCustomizeMural, onOpenGratitudeWall, onDataChanged, onInstallPWA, onToast }) {
  const est = await getStorageEstimate();
  const usageMb = est ? (est.usage / (1024 * 1024)).toFixed(2) : null;

  container.innerHTML = `
    <div class="tab-header-bar">
      <h2>Mais</h2>
    </div>

    <!-- App Identity Banner -->
    <div class="card more-brand-card">
      <img src="./assets/icon.svg" alt="Ícone Diário de Bordo" class="more-brand-icon">
      <div>
        <h3>Diário de Bordo</h3>
        <p>100% privado · Offline no IndexedDB · Sem anúncios</p>
      </div>
    </div>

    <!-- Personalization -->
    <div class="more-group-label">Personalização</div>
    <div class="card more-menu-card">
      <button class="more-row" id="more-customize-mural">
        <span class="more-row-icon gold">${ICONS.imageEdit}</span>
        <div class="more-row-text">
          <strong>Personalizar Mural do Topo</strong>
          <span>Alterar mosaico de fotos e citação filosófica</span>
        </div>
        <span class="more-row-chev">${ICONS.chevRight}</span>
      </button>

      <div class="more-divider"></div>

      <button class="more-row" id="more-gratitude-wall">
        <span class="more-row-icon gold">${ICONS.heart}</span>
        <div class="more-row-text">
          <strong>Mural de Gratidão com Pessoas</strong>
          <span>${gratitudeCount === 0 ? 'Cadastrar pessoas marcantes e motivos de gratidão' : `${gratitudeCount} ${gratitudeCount === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}`}</span>
        </div>
        <span class="more-row-chev">${ICONS.chevRight}</span>
      </button>
    </div>

    <!-- Data & Backup -->
    <div class="more-group-label">Backup & Dados Locais</div>
    <div class="card more-menu-card">
      <button class="more-row" id="more-export-json">
        <span class="more-row-icon gold">${ICONS.download}</span>
        <div class="more-row-text">
          <strong>Exportar Backup (JSON)</strong>
          <span>Salva textos, fotos, áudios, mural e pessoas (${entriesCount} ${entriesCount === 1 ? 'registro' : 'registros'})</span>
        </div>
        <span class="more-row-chev">${ICONS.chevRight}</span>
      </button>

      <div class="more-divider"></div>

      <label class="more-row more-row-file">
        <span class="more-row-icon gold">${ICONS.upload}</span>
        <div class="more-row-text">
          <strong>Importar Backup (JSON)</strong>
          <span>Restaura registros e mídias de um arquivo salvo</span>
        </div>
        <span class="more-row-chev">${ICONS.chevRight}</span>
        <input type="file" id="more-import-json" accept="application/json,.json" hidden>
      </label>
    </div>

    <!-- PWA Installation -->
    <div class="more-group-label">Aplicativo Offline (PWA)</div>
    <div class="card more-menu-card">
      <button class="more-row" id="more-install-pwa">
        <span class="more-row-icon gold">${ICONS.install}</span>
        <div class="more-row-text">
          <strong>${isStandalone ? 'Aplicativo Instalado' : 'Instalar como Aplicativo (PWA)'}</strong>
          <span>${isStandalone
            ? 'Rodando em modo aplicativo independente'
            : (pwaInstallEvent
              ? 'Pronto para instalar na tela inicial / área de trabalho'
              : 'Adicionar à tela inicial do celular ou computador')}</span>
        </div>
        <span class="more-row-chev">${ICONS.chevRight}</span>
      </button>
    </div>

    <!-- Storage & Danger Zone -->
    <div class="more-group-label">Armazenamento Local</div>
    <div class="card more-menu-card">
      <div class="more-info-row">
        <span>Banco de dados local</span>
        <span class="more-info-val">IndexedDB ${usageMb !== null ? `· ${usageMb} MB usados` : '· Ativo'}</span>
      </div>
      <div class="more-divider"></div>
      <button class="more-row danger" id="more-clear-all">
        <span class="more-row-icon">${ICONS.trash}</span>
        <div class="more-row-text">
          <strong>Apagar todos os dados</strong>
          <span>Remove todos os registros, fotos e áudios locais</span>
        </div>
      </button>
    </div>

    <p class="more-footer-credit">Diário de Bordo · Seus dados pertencem somente a você.</p>
  `;

  container.querySelector('#more-customize-mural')?.addEventListener('click', () => {
    onCustomizeMural?.();
  });

  container.querySelector('#more-gratitude-wall')?.addEventListener('click', () => {
    onOpenGratitudeWall?.();
  });

  container.querySelector('#more-export-json')?.addEventListener('click', async () => {
    try {
      onToast?.('Gerando arquivo de backup...');
      const backup = await exportFullBackup();
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diario-de-bordo-backup-${toDateKey(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onToast?.('Backup JSON exportado com sucesso!');
    } catch {
      onToast?.('Erro ao exportar backup.');
    }
  });

  container.querySelector('#more-import-json')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const count = await importFullBackup(parsed);
      onToast?.(`Backup restaurado (${count} ${count === 1 ? 'registro' : 'registros'})!`);
      onDataChanged?.();
    } catch {
      onToast?.('Não foi possível ler este arquivo de backup JSON.');
    } finally {
      e.target.value = '';
    }
  });

  container.querySelector('#more-install-pwa')?.addEventListener('click', () => {
    onInstallPWA?.();
  });

  container.querySelector('#more-clear-all')?.addEventListener('click', async () => {
    if (confirm('Atenção: isso apagará permanentemente TODOS os registros, fotos, áudios e o mural personalizado. Deseja continuar?')) {
      if (confirm('Confirmação final: recomenda-se exportar um backup JSON antes. Apagar tudo mesmo assim?')) {
        await clearAllData();
        onToast?.('Todos os dados locais foram removidos.');
        onDataChanged?.();
      }
    }
  });
}
