import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type TickTickTagProgressPlugin from './main';
import { storeTickTickAccessToken } from './settings-model';

function csv(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export class TickTickTagProgressSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: TickTickTagProgressPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'TickTick 태그 진행률' });
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text: '공식 Open API v1을 읽기 전용으로 사용합니다. 토큰 값은 SecretStorage에만 보관됩니다.',
    });

    const hasToken = Boolean(this.app.secretStorage.getSecret(this.plugin.settings.secretName));
    let pendingToken = '';
    new Setting(containerEl)
      .setName('TickTick API 토큰 직접 저장')
      .setDesc('TickTick 웹 → 설정 → 계정 → API Token에서 만든 토큰만 붙여넣으세요. 로그인 이메일과 비밀번호는 입력하지 않습니다. 토큰 값은 Obsidian SecretStorage에 저장됩니다.')
      .addText((text) => {
        text.setPlaceholder(hasToken ? '저장된 토큰을 변경하려면 새 토큰 붙여넣기' : 'API 토큰 붙여넣기')
          .onChange((value) => { pendingToken = value; });
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
      })
      .addButton((button) => button
        .setButtonText('토큰 저장')
        .setCta()
        .onClick(async () => {
          try {
            this.plugin.settings.secretName = storeTickTickAccessToken(this.app.secretStorage, pendingToken);
            await this.plugin.savePluginData();
            new Notice('TickTick API 토큰을 SecretStorage에 저장했습니다.');
            this.display();
          } catch {
            new Notice('TickTick 로그인 이메일이나 비밀번호가 아니라 API Token 값을 붙여넣으세요.', 8000);
          }
        }));

    new Setting(containerEl)
      .setName('토큰 저장 상태')
      .setDesc(hasToken
        ? `저장됨 · SecretStorage ID: ${this.plugin.settings.secretName}`
        : '미설정 · TickTick 계정의 API Token을 발급받아 위 입력란에 저장하세요.');

    new Setting(containerEl)
      .setName('연결 확인')
      .setDesc('토큰을 로그에 남기지 않고 프로젝트 목록 읽기만 시험합니다.')
      .addButton((button) => button.setButtonText('공식 API 확인').onClick(async () => this.plugin.testConnection()));

    new Setting(containerEl)
      .setName('포함 태그')
      .setDesc('쉼표로 구분합니다. 비워 두면 모든 태그를 표시합니다.')
      .addText((text) => text.setPlaceholder('UNIOS8K, UNI610H').setValue(this.plugin.settings.includeTags.join(', ')).onChange(async (value) => {
        this.plugin.settings.includeTags = csv(value);
        await this.plugin.savePluginData();
        this.plugin.refreshViews();
      }));

    new Setting(containerEl)
      .setName('제외 태그')
      .setDesc('포함 목록보다 우선합니다.')
      .addText((text) => text.setValue(this.plugin.settings.excludeTags.join(', ')).onChange(async (value) => {
        this.plugin.settings.excludeTags = csv(value);
        await this.plugin.savePluginData();
        this.plugin.refreshViews();
      }));

    new Setting(containerEl)
      .setName('미분류 표시')
      .setDesc('태그 없는 태스크를 미분류 행으로 모읍니다.')
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.showUntagged).onChange(async (value) => {
        this.plugin.settings.showUntagged = value;
        await this.plugin.savePluginData();
        this.plugin.refreshViews();
      }));

    new Setting(containerEl)
      .setName('Projects.base 경로')
      .setDesc('생성된 로컬 노트를 여는 기존 Base입니다. 새 Base는 만들지 않습니다.')
      .addText((text) => text.setValue(this.plugin.settings.projectsBasePath).onChange(async (value) => {
        this.plugin.settings.projectsBasePath = value.trim();
        await this.plugin.savePluginData();
      }));

    new Setting(containerEl)
      .setName('Bases 뷰 연결')
      .setDesc('기존 Projects.base에 TickTick Task Notes 뷰가 없을 때만 안전하게 추가합니다.')
      .addButton((button) => button.setButtonText('연결 확인/추가').onClick(async () => this.plugin.ensureProjectsBase()));
  }
}
