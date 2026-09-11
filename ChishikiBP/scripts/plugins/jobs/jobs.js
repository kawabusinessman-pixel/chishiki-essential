import {
    world,
    system,
    Player,
    ItemStack,
    ActionFormData as BaseActionFormData,
    MessageFormData as BaseMessageFormData,
    ModalFormData as BaseModalFormData,
    CommandPermissionLevel,
    CustomCommandParamType,
    CustomCommandStatus
} from '../../core.js';
import { DisplaySlotId } from '@minecraft/server';
import { JOBS_ADDON_CONFIG, JOB_DEFINITIONS } from './jobs_config.js';
import { isMemberFeatureEnabled } from '../../function/memberFeatureState.js';
import { getFullMoney, addMoney, removeMoney } from '../../function/moneySystem.js';

// ==========================================
// LOCALIZATION (Per-player language via tags)
// ==========================================

const LANG = {
    DEFAULT: "en",
    TAG_PREFIX: "jobs_lang:"
};

const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "zh_CN", label: "中文(简体)" },
    { code: "es", label: "Español" },
    { code: "pt_BR", label: "Português (Brasil)" },
    { code: "ru", label: "Русский" },
    { code: "ja", label: "日本語" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
    { code: "ko", label: "한국어" },
    { code: "id", label: "Bahasa Indonesia" }
];

function getPlayerLang(player) {
    try {
        if (!player?.getTags) return LANG.DEFAULT;
        const tag = player.getTags().find(t => t.startsWith(LANG.TAG_PREFIX));
        return tag ? tag.substring(LANG.TAG_PREFIX.length) : LANG.DEFAULT;
    } catch {
        return LANG.DEFAULT;
    }
}

function hasPlayerLang(player) {
    try {
        if (!player?.getTags) return false;
        return player.getTags().some(t => t.startsWith(LANG.TAG_PREFIX));
    } catch {
        return false;
    }
}

const plainJobsUiText = (text) =>
    typeof text === 'string' ? text.replace(/§[0-9a-fk-or]/gi, '') : text;

const jobIconPath = (job) => {
    const icon = String(job?.icon || 'paper');
    return icon.startsWith('textures/') ? icon : `textures/items/${icon}`;
};

class ActionFormData extends BaseActionFormData {
    constructor() {
        super();
        this.preserveButtonCase();
    }

    title(text) {
        return super.title(plainJobsUiText(text));
    }

    button(text, iconPath) {
        return super.button(plainJobsUiText(text), iconPath);
    }
}

class MessageFormData extends BaseMessageFormData {
    title(text) {
        return super.title(plainJobsUiText(text));
    }

    button1(text) {
        return super.button1(plainJobsUiText(text));
    }

    button2(text) {
        return super.button2(plainJobsUiText(text));
    }
}

class ModalFormData extends BaseModalFormData {
    title(text) {
        return super.title(plainJobsUiText(text));
    }
}

function setPlayerLang(player, code) {
    if (!player?.getTags || !player?.addTag || !player?.removeTag) return;
    try {
        for (const t of player.getTags()) {
            if (t.startsWith(LANG.TAG_PREFIX)) player.removeTag(t);
        }
        player.addTag(LANG.TAG_PREFIX + code);
    } catch (e) {
        console.error("[Jobs] Failed to set language:", e);
    }
}

function template(str, params = {}) {
    return String(str).replace(/\{(\w+)\}/g, (_, k) => {
        const v = params[k];
        return v === undefined || v === null ? "" : String(v);
    });
}

const I18N = {
    en: {
        "system.loaded": "§aAdvance Jobs Loaded!",
        "system.use_clock": "§eType {command} to open the menu!",
        "ui.language.title": "§l§bLanguage",
        "ui.language.body": "§7Select your language:",
        "ui.language.saved": "§aLanguage set to §f{lang}§a.",

        "ui.main.title": "§l§6ADVANCED JOBS §r§7v5.3.0",
        "ui.main.welcome": "§7Welcome, §e{player}§7!",
        "ui.main.active_jobs": "§6Active Jobs",
        "ui.main.total_earnings": "§6Total Earnings",
        "ui.main.quests_completed": "§6Quests Completed",
        "ui.main.achievements": "§6Achievements",

        "btn.my_jobs": "§aMy Jobs\n§7View & Manage",
        "btn.browse_jobs": "§eBrowse Jobs\n§7Join new profession",
        "btn.leave_job": "§cLeave Job\n§7Quit profession",
        "btn.statistics": "§bStatistics\n§7Career overview",
        "btn.upgrades": "§5Upgrades\n§7Enhance abilities",
        "btn.quests": "§dQuests\n§7Daily challenges",
        "btn.achievements": "§6Achievements\n§7Track progress",
        "btn.activity": "§3Activity\n§7Job limits & status",
        "btn.language": "§bLanguage\n§7Change menu language",
        "btn.help": "§9Help\n§7How to play",
        "btn.close": "§cClose",
        "btn.back": "§7« Back",

        "error.data": "§cError loading your data. Please rejoin.",

        "job.joined": "§a* Joined {job}§a! §7Type {command} to open the menu.",
        "job.left": "§6Left {job}§6. §7Cooldown: 5 minutes",
        "limit.reached": "§c[!] Activity limit reached for {job}§c! §7Regenerates over time.",
        "levelup": "§6* §lLEVEL UP!§r §6{job} §ereached level {level}!",

        "quests.new": "§eNew daily quests are available! §7Check your job menu.",
        "quests.complete": "§d* §lQUEST COMPLETE!§r §d{quest}",
        "achievement.unlocked": "§6* §lACHIEVEMENT UNLOCKED!§r §6{achievement}",

        "money.balance": "§2Balance: §a{amount}",
        "money.pay.usage": "§cUsage: !jpay <player> <amount>",
        "money.pay.invalid": "§cInvalid amount",
        "money.pay.self": "§cYou cannot pay yourself",
        "money.pay.not_found": "§cPlayer \"{player}\" not found",
        "money.pay.insufficient": "§cInsufficient funds. Balance: {balance}",
        "money.pay.sent": "§aPaid {player} {amount}",
        "money.pay.received": "§aReceived {amount} from {player}",

        "admin.no_permission": "§cNo permission",
        "admin.usage": "§cUsage: !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "Mining",
        "reward.woodcutting": "Woodcutting",
        "reward.farming": "Farming",
        "reward.building": "Building",
        "reward.hunting": "Hunting",
        "reward.fishing": "Fishing",
        "reward.treasure": "Treasure",
        "reward.crafting": "Crafting",
        "reward.enchanting": "Enchanting",
        "reward.trading": "Trading",
        "reward.exploration": "Exploration"
    },
    zh_CN: {
        "system.loaded": "§a高级职业已加载！",
        "system.use_clock": "§e输入 {command} 打开菜单！",
        "ui.language.title": "§l§b语言",
        "ui.language.body": "§7请选择语言：",
        "ui.language.saved": "§a语言已设置为 §f{lang}§a。",

        "ui.main.title": "§l§6高级职业 §r§7v5.3.0",
        "ui.main.welcome": "§7欢迎，§e{player}§7！",
        "ui.main.active_jobs": "§6当前职业",
        "ui.main.total_earnings": "§6总收入",
        "ui.main.quests_completed": "§6已完成任务",
        "ui.main.achievements": "§6成就",

        "btn.my_jobs": "§a我的职业\n§7查看与管理",
        "btn.browse_jobs": "§e浏览职业\n§7加入新职业",
        "btn.leave_job": "§c离开职业\n§7退出职业",
        "btn.statistics": "§b统计\n§7职业概览",
        "btn.upgrades": "§5升级\n§7强化能力",
        "btn.quests": "§d任务\n§7每日挑战",
        "btn.achievements": "§6成就\n§7追踪进度",
        "btn.activity": "§3活跃度\n§7限制与状态",
        "btn.language": "§b语言\n§7更改菜单语言",
        "btn.help": "§9帮助\n§7玩法说明",
        "btn.close": "§c关闭",
        "btn.back": "§7« 返回",

        "error.data": "§c加载数据失败，请重新加入。",

        "job.joined": "§a* 已加入 {job}§a！§7输入 {command} 打开菜单。",
        "job.left": "§6已退出 {job}§6。§7冷却：5分钟",
        "limit.reached": "§c[!] {job}§c 的活跃度已用尽！§7会随时间恢复。",
        "levelup": "§6* §l升级！§r §6{job} §e达到 {level} 级！",

        "quests.new": "§e新的每日任务已刷新！§7请在职业菜单中查看。",
        "quests.complete": "§d* §l任务完成！§r §d{quest}",
        "achievement.unlocked": "§6* §l解锁成就！§r §6{achievement}",

        "money.balance": "§2余额：§a{amount}",
        "money.pay.usage": "§c用法：!jpay <玩家> <金额>",
        "money.pay.invalid": "§c金额无效",
        "money.pay.self": "§c你不能给自己转账",
        "money.pay.not_found": "§c未找到玩家 “{player}”",
        "money.pay.insufficient": "§c余额不足。余额：{balance}",
        "money.pay.sent": "§a已支付 {player} {amount}",
        "money.pay.received": "§a收到来自 {player} 的 {amount}",

        "admin.no_permission": "§c没有权限",
        "admin.usage": "§c用法：!jadmin <give|take|reset|reload> [参数]",

        "reward.mining": "采矿",
        "reward.woodcutting": "伐木",
        "reward.farming": "农耕",
        "reward.building": "建造",
        "reward.hunting": "狩猎",
        "reward.fishing": "钓鱼",
        "reward.treasure": "宝藏",
        "reward.crafting": "合成",
        "reward.enchanting": "附魔",
        "reward.trading": "交易",
        "reward.exploration": "探索"
    },
    es: {
        "system.loaded": "§a¡Trabajos avanzados cargados!",
        "system.use_clock": "§e¡Escribe {command} para abrir el menú!",
        "ui.language.title": "§l§bIdioma",
        "ui.language.body": "§7Selecciona tu idioma:",
        "ui.language.saved": "§aIdioma cambiado a §f{lang}§a.",

        "ui.main.title": "§l§6TRABAJOS AVANZADOS §r§7v5.3.0",
        "ui.main.welcome": "§7¡Bienvenido, §e{player}§7!",
        "ui.main.active_jobs": "§6Trabajos activos",
        "ui.main.total_earnings": "§6Ganancias totales",
        "ui.main.quests_completed": "§6Misiones completadas",
        "ui.main.achievements": "§6Logros",

        "btn.my_jobs": "§aMis trabajos\n§7Ver y gestionar",
        "btn.browse_jobs": "§eExplorar trabajos\n§7Unirse a una profesión",
        "btn.leave_job": "§cDejar trabajo\n§7Salir de la profesión",
        "btn.statistics": "§bEstadísticas\n§7Resumen de carrera",
        "btn.upgrades": "§5Mejoras\n§7Mejorar habilidades",
        "btn.quests": "§dMisiones\n§7Desafíos diarios",
        "btn.achievements": "§6Logros\n§7Seguir progreso",
        "btn.activity": "§3Actividad\n§7Límites y estado",
        "btn.language": "§bIdioma\n§7Cambiar idioma",
        "btn.help": "§9Ayuda\n§7Cómo jugar",
        "btn.close": "§cCerrar",
        "btn.back": "§7« Atrás",

        "error.data": "§cError al cargar tus datos. Vuelve a entrar.",

        "job.joined": "§a* Te uniste a {job}§a. §7Escribe {command} para abrir el menú.",
        "job.left": "§6Dejaste {job}§6. §7Enfriamiento: 5 minutos",
        "limit.reached": "§c[!] Límite de actividad alcanzado para {job}§c. §7Se regenera con el tiempo.",
        "levelup": "§6* §l¡SUBISTE DE NIVEL!§r §6{job} §ealcanzó el nivel {level}!",

        "quests.new": "§e¡Hay nuevas misiones diarias! §7Revisa tu menú de trabajos.",
        "quests.complete": "§d* §l¡MISIÓN COMPLETADA!§r §d{quest}",
        "achievement.unlocked": "§6* §l¡LOGRO DESBLOQUEADO!§r §6{achievement}",

        "money.balance": "§2Saldo: §a{amount}",
        "money.pay.usage": "§cUso: !jpay <jugador> <cantidad>",
        "money.pay.invalid": "§cCantidad inválida",
        "money.pay.self": "§cNo puedes pagarte a ti mismo",
        "money.pay.not_found": "§cJugador \"{player}\" no encontrado",
        "money.pay.insufficient": "§cFondos insuficientes. Saldo: {balance}",
        "money.pay.sent": "§aPagaste a {player} {amount}",
        "money.pay.received": "§aRecibiste {amount} de {player}",

        "admin.no_permission": "§cSin permiso",
        "admin.usage": "§cUso: !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "Minería",
        "reward.woodcutting": "Tala",
        "reward.farming": "Agricultura",
        "reward.building": "Construcción",
        "reward.hunting": "Caza",
        "reward.fishing": "Pesca",
        "reward.treasure": "Tesoro",
        "reward.crafting": "Crafteo",
        "reward.enchanting": "Encantamiento",
        "reward.trading": "Comercio",
        "reward.exploration": "Exploración"
    },
    pt_BR: {
        "system.loaded": "§aEmpregos Avançados carregados!",
        "system.use_clock": "§eDigite {command} para abrir o menu!",
        "ui.language.title": "§l§bIdioma",
        "ui.language.body": "§7Selecione seu idioma:",
        "ui.language.saved": "§aIdioma definido para §f{lang}§a.",

        "ui.main.title": "§l§6EMPREGOS AVANÇADOS §r§7v5.3.0",
        "ui.main.welcome": "§7Bem-vindo, §e{player}§7!",
        "ui.main.active_jobs": "§6Empregos ativos",
        "ui.main.total_earnings": "§6Ganhos totais",
        "ui.main.quests_completed": "§6Missões concluídas",
        "ui.main.achievements": "§6Conquistas",

        "btn.my_jobs": "§aMeus empregos\n§7Ver e gerenciar",
        "btn.browse_jobs": "§eVer empregos\n§7Entrar em uma profissão",
        "btn.leave_job": "§cSair do emprego\n§7Deixar a profissão",
        "btn.statistics": "§bEstatísticas\n§7Visão geral",
        "btn.upgrades": "§5Melhorias\n§7Aprimorar habilidades",
        "btn.quests": "§dMissões\n§7Desafios diários",
        "btn.achievements": "§6Conquistas\n§7Acompanhar progresso",
        "btn.activity": "§3Atividade\n§7Limites e status",
        "btn.language": "§bIdioma\n§7Alterar idioma",
        "btn.help": "§9Ajuda\n§7Como jogar",
        "btn.close": "§cFechar",
        "btn.back": "§7« Voltar",

        "error.data": "§cErro ao carregar seus dados. Entre novamente.",

        "job.joined": "§a* Você entrou em {job}§a! §7Digite {command} para abrir o menu.",
        "job.left": "§6Você saiu de {job}§6. §7Recarga: 5 minutos",
        "limit.reached": "§c[!] Limite de atividade atingido para {job}§c! §7Regenera com o tempo.",
        "levelup": "§6* §lSUBIU DE NÍVEL!§r §6{job} §echegou ao nível {level}!",

        "quests.new": "§eNovas missões diárias disponíveis! §7Confira no menu.",
        "quests.complete": "§d* §lMISSÃO CONCLUÍDA!§r §d{quest}",
        "achievement.unlocked": "§6* §lCONQUISTA DESBLOQUEADA!§r §6{achievement}",

        "money.balance": "§2Saldo: §a{amount}",
        "money.pay.usage": "§cUso: !jpay <jogador> <quantia>",
        "money.pay.invalid": "§cQuantia inválida",
        "money.pay.self": "§cVocê não pode pagar a si mesmo",
        "money.pay.not_found": "§cJogador \"{player}\" não encontrado",
        "money.pay.insufficient": "§cSaldo insuficiente. Saldo: {balance}",
        "money.pay.sent": "§aVocê pagou {player} {amount}",
        "money.pay.received": "§aVocê recebeu {amount} de {player}",

        "admin.no_permission": "§cSem permissão",
        "admin.usage": "§cUso: !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "Mineração",
        "reward.woodcutting": "Lenhador",
        "reward.farming": "Fazenda",
        "reward.building": "Construção",
        "reward.hunting": "Caça",
        "reward.fishing": "Pesca",
        "reward.treasure": "Tesouro",
        "reward.crafting": "Artesanato",
        "reward.enchanting": "Encantamento",
        "reward.trading": "Comércio",
        "reward.exploration": "Exploração"
    },
    ru: {
        "system.loaded": "§aСистема профессий загружена!",
        "system.use_clock": "§eВведите {command}, чтобы открыть меню!",
        "ui.language.title": "§l§bЯзык",
        "ui.language.body": "§7Выберите язык:",
        "ui.language.saved": "§aЯзык установлен: §f{lang}§a.",

        "ui.main.title": "§l§6ПРОФЕССИИ §r§7v5.3.0",
        "ui.main.welcome": "§7Добро пожаловать, §e{player}§7!",
        "ui.main.active_jobs": "§6Активные профессии",
        "ui.main.total_earnings": "§6Всего заработано",
        "ui.main.quests_completed": "§6Квестов выполнено",
        "ui.main.achievements": "§6Достижения",

        "btn.my_jobs": "§aМои профессии\n§7Управление",
        "btn.browse_jobs": "§eВыбрать профессию\n§7Начать карьеру",
        "btn.leave_job": "§cПокинуть\n§7Выйти из профессии",
        "btn.statistics": "§bСтатистика\n§7Обзор",
        "btn.upgrades": "§5Улучшения\n§7Повысить навыки",
        "btn.quests": "§dКвесты\n§7Ежедневные задания",
        "btn.achievements": "§6Достижения\n§7Прогресс",
        "btn.activity": "§3Активность\n§7Лимиты и статус",
        "btn.language": "§bЯзык\n§7Изменить язык",
        "btn.help": "§9Помощь\n§7Как играть",
        "btn.close": "§cЗакрыть",
        "btn.back": "§7« Назад",

        "error.data": "§cОшибка загрузки данных. Перезайдите.",

        "job.joined": "§a* Вы выбрали {job}§a! §7Введите {command}, чтобы открыть меню.",
        "job.left": "§6Вы покинули {job}§6. §7КД: 5 минут",
        "limit.reached": "§c[!] Достигнут лимит активности для {job}§c. §7Восстанавливается со временем.",
        "levelup": "§6* §lНОВЫЙ УРОВЕНЬ!§r §6{job} §eдостиг уровня {level}!",

        "quests.new": "§eДоступны новые ежедневные квесты! §7Проверьте меню.",
        "quests.complete": "§d* §lКВЕСТ ВЫПОЛНЕН!§r §d{quest}",
        "achievement.unlocked": "§6* §lДОСТИЖЕНИЕ ОТКРЫТО!§r §6{achievement}",

        "money.balance": "§2Баланс: §a{amount}",
        "money.pay.usage": "§cИспользование: !jpay <игрок> <сумма>",
        "money.pay.invalid": "§cНеверная сумма",
        "money.pay.self": "§cНельзя платить самому себе",
        "money.pay.not_found": "§cИгрок \"{player}\" не найден",
        "money.pay.insufficient": "§cНедостаточно средств. Баланс: {balance}",
        "money.pay.sent": "§aВы перевели {player} {amount}",
        "money.pay.received": "§aВы получили {amount} от {player}",

        "admin.no_permission": "§cНет прав",
        "admin.usage": "§cИспользование: !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "Добыча",
        "reward.woodcutting": "Лесоруб",
        "reward.farming": "Фермерство",
        "reward.building": "Строительство",
        "reward.hunting": "Охота",
        "reward.fishing": "Рыбалка",
        "reward.treasure": "Сокровище",
        "reward.crafting": "Крафт",
        "reward.enchanting": "Зачарование",
        "reward.trading": "Торговля",
        "reward.exploration": "Исследование"
    },
    ja: {
        "system.loaded": "§a高度な職業システムが読み込まれました！",
        "system.use_clock": "§e{command} でメニューを開けます！",
        "ui.language.title": "§l§b言語",
        "ui.language.body": "§7言語を選択してください：",
        "ui.language.saved": "§a言語を §f{lang}§a に設定しました。",

        "ui.main.title": "§l§6ADVANCED JOBS §r§7v5.3.0",
        "ui.main.welcome": "§7ようこそ、§e{player}§7！",
        "ui.main.active_jobs": "§6現在の職業",
        "ui.main.total_earnings": "§6総収入",
        "ui.main.quests_completed": "§6完了したクエスト",
        "ui.main.achievements": "§6実績",

        "btn.my_jobs": "§a自分の職業\n§7管理する",
        "btn.browse_jobs": "§e職業を探す\n§7新しい職業へ",
        "btn.leave_job": "§c職業をやめる\n§7退出する",
        "btn.statistics": "§b統計\n§7概要",
        "btn.upgrades": "§5アップグレード\n§7能力強化",
        "btn.quests": "§dクエスト\n§7デイリー",
        "btn.achievements": "§6実績\n§7進行状況",
        "btn.activity": "§3アクティビティ\n§7上限と状態",
        "btn.language": "§b言語\n§7言語を変更",
        "btn.help": "§9ヘルプ\n§7遊び方",
        "btn.close": "§c閉じる",
        "btn.back": "§7« 戻る",

        "error.data": "§cデータの読み込みに失敗しました。再参加してください。",

        "job.joined": "§a* {job}§a に参加しました！ §7{command} でメニューを開けます。",
        "job.left": "§6{job}§6 を退出しました。§7クールダウン：5分",
        "limit.reached": "§c[!] {job}§c のアクティビティ上限に達しました。§7時間で回復します。",
        "levelup": "§6* §lレベルアップ！§r §6{job} §eがレベル {level} に到達！",

        "quests.new": "§e新しいデイリークエストがあります！§7メニューを確認してください。",
        "quests.complete": "§d* §lクエスト達成！§r §d{quest}",
        "achievement.unlocked": "§6* §l実績解除！§r §6{achievement}",

        "money.balance": "§2残高：§a{amount}",
        "money.pay.usage": "§c使い方：!jpay <プレイヤー> <金額>",
        "money.pay.invalid": "§c金額が無効です",
        "money.pay.self": "§c自分に支払うことはできません",
        "money.pay.not_found": "§cプレイヤー \"{player}\" が見つかりません",
        "money.pay.insufficient": "§c残高不足。残高：{balance}",
        "money.pay.sent": "§a{player} に {amount} を支払いました",
        "money.pay.received": "§a{player} から {amount} を受け取りました",

        "admin.no_permission": "§c権限がありません",
        "admin.usage": "§c使い方：!jadmin <give|take|reset|reload> [args]",

        "reward.mining": "採掘",
        "reward.woodcutting": "伐採",
        "reward.farming": "農業",
        "reward.building": "建築",
        "reward.hunting": "狩猟",
        "reward.fishing": "釣り",
        "reward.treasure": "宝物",
        "reward.crafting": "クラフト",
        "reward.enchanting": "エンチャント",
        "reward.trading": "取引",
        "reward.exploration": "探索"
    },
    de: {
        "system.loaded": "§aAdvanced Jobs geladen!",
        "system.use_clock": "§eTippe {command}, um das Menü zu öffnen!",
        "ui.language.title": "§l§bSprache",
        "ui.language.body": "§7Sprache auswählen:",
        "ui.language.saved": "§aSprache auf §f{lang}§a gesetzt.",

        "ui.main.title": "§l§6ADVANCED JOBS §r§7v5.3.0",
        "ui.main.welcome": "§7Willkommen, §e{player}§7!",
        "ui.main.active_jobs": "§6Aktive Jobs",
        "ui.main.total_earnings": "§6Gesamteinnahmen",
        "ui.main.quests_completed": "§6Quests abgeschlossen",
        "ui.main.achievements": "§6Errungenschaften",

        "btn.my_jobs": "§aMeine Jobs\n§7Verwalten",
        "btn.browse_jobs": "§eJobs durchsuchen\n§7Neuen Job wählen",
        "btn.leave_job": "§cJob verlassen\n§7Kündigen",
        "btn.statistics": "§bStatistik\n§7Übersicht",
        "btn.upgrades": "§5Upgrades\n§7Fähigkeiten verbessern",
        "btn.quests": "§dQuests\n§7Tägliche Aufgaben",
        "btn.achievements": "§6Errungenschaften\n§7Fortschritt",
        "btn.activity": "§3Aktivität\n§7Limits & Status",
        "btn.language": "§bSprache\n§7Sprache ändern",
        "btn.help": "§9Hilfe\n§7Anleitung",
        "btn.close": "§cSchließen",
        "btn.back": "§7« Zurück",

        "error.data": "§cFehler beim Laden deiner Daten. Bitte neu beitreten.",

        "job.joined": "§a* {job}§a beigetreten! §7Tippe {command}, um das Menü zu öffnen.",
        "job.left": "§6{job}§6 verlassen. §7Abklingzeit: 5 Minuten",
        "limit.reached": "§c[!] Aktivitätslimit erreicht für {job}§c! §7Regeneriert mit der Zeit.",
        "levelup": "§6* §lLEVEL AUF!§r §6{job} §eerreichte Level {level}!",

        "quests.new": "§eNeue tägliche Quests verfügbar! §7Im Job-Menü ansehen.",
        "quests.complete": "§d* §lQUEST ABGESCHLOSSEN!§r §d{quest}",
        "achievement.unlocked": "§6* §lERRUNGENSCHAFT FREIGESCHALTET!§r §6{achievement}",

        "money.balance": "§2Kontostand: §a{amount}",
        "money.pay.usage": "§cNutzung: !jpay <spieler> <betrag>",
        "money.pay.invalid": "§cUngültiger Betrag",
        "money.pay.self": "§cDu kannst dir nicht selbst zahlen",
        "money.pay.not_found": "§cSpieler \"{player}\" nicht gefunden",
        "money.pay.insufficient": "§cNicht genug Geld. Kontostand: {balance}",
        "money.pay.sent": "§a{player} {amount} bezahlt",
        "money.pay.received": "§a{amount} von {player} erhalten",

        "admin.no_permission": "§cKeine Berechtigung",
        "admin.usage": "§cNutzung: !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "Bergbau",
        "reward.woodcutting": "Holzfällen",
        "reward.farming": "Landwirtschaft",
        "reward.building": "Bauen",
        "reward.hunting": "Jagd",
        "reward.fishing": "Angeln",
        "reward.treasure": "Schatz",
        "reward.crafting": "Crafting",
        "reward.enchanting": "Verzaubern",
        "reward.trading": "Handel",
        "reward.exploration": "Erkundung"
    },
    fr: {
        "system.loaded": "§aJobs avancés chargés !",
        "system.use_clock": "§eTapez {command} pour ouvrir le menu !",
        "ui.language.title": "§l§bLangue",
        "ui.language.body": "§7Choisissez votre langue :",
        "ui.language.saved": "§aLangue définie sur §f{lang}§a.",

        "ui.main.title": "§l§6JOBS AVANCÉS §r§7v5.3.0",
        "ui.main.welcome": "§7Bienvenue, §e{player}§7 !",
        "ui.main.active_jobs": "§6Jobs actifs",
        "ui.main.total_earnings": "§6Gains totaux",
        "ui.main.quests_completed": "§6Quêtes terminées",
        "ui.main.achievements": "§6Succès",

        "btn.my_jobs": "§aMes jobs\n§7Gérer",
        "btn.browse_jobs": "§eParcourir\n§7Rejoindre une profession",
        "btn.leave_job": "§cQuitter\n§7Abandonner le job",
        "btn.statistics": "§bStatistiques\n§7Aperçu",
        "btn.upgrades": "§5Améliorations\n§7Renforcer",
        "btn.quests": "§dQuêtes\n§7Défis quotidiens",
        "btn.achievements": "§6Succès\n§7Suivre le progrès",
        "btn.activity": "§3Activité\n§7Limites et état",
        "btn.language": "§bLangue\n§7Changer la langue",
        "btn.help": "§9Aide\n§7Comment jouer",
        "btn.close": "§cFermer",
        "btn.back": "§7« Retour",

        "error.data": "§cErreur de chargement des données. Reconnectez-vous.",

        "job.joined": "§a* Vous avez rejoint {job}§a ! §7Tapez {command} pour ouvrir le menu.",
        "job.left": "§6Vous avez quitté {job}§6. §7Recharge : 5 minutes",
        "limit.reached": "§c[!] Limite d’activité atteinte pour {job}§c. §7Se régénère avec le temps.",
        "levelup": "§6* §lNIVEAU SUPÉRIEUR !§r §6{job} §ea atteint le niveau {level} !",

        "quests.new": "§eNouvelles quêtes quotidiennes disponibles ! §7Vérifiez le menu.",
        "quests.complete": "§d* §lQUÊTE TERMINÉE !§r §d{quest}",
        "achievement.unlocked": "§6* §lSUCCÈS DÉBLOQUÉ !§r §6{achievement}",

        "money.balance": "§2Solde : §a{amount}",
        "money.pay.usage": "§cUtilisation : !jpay <joueur> <montant>",
        "money.pay.invalid": "§cMontant invalide",
        "money.pay.self": "§cVous ne pouvez pas vous payer vous‑même",
        "money.pay.not_found": "§cJoueur \"{player}\" introuvable",
        "money.pay.insufficient": "§cFonds insuffisants. Solde : {balance}",
        "money.pay.sent": "§aPaiement à {player} : {amount}",
        "money.pay.received": "§aVous avez reçu {amount} de {player}",

        "admin.no_permission": "§cPas de permission",
        "admin.usage": "§cUtilisation : !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "Minage",
        "reward.woodcutting": "Bûcheronnage",
        "reward.farming": "Agriculture",
        "reward.building": "Construction",
        "reward.hunting": "Chasse",
        "reward.fishing": "Pêche",
        "reward.treasure": "Trésor",
        "reward.crafting": "Craft",
        "reward.enchanting": "Enchantement",
        "reward.trading": "Commerce",
        "reward.exploration": "Exploration"
    },
    ko: {
        "system.loaded": "§a고급 직업 시스템이 로드되었습니다!",
        "system.use_clock": "§e{command} 명령어로 메뉴를 여세요!",
        "ui.language.title": "§l§b언어",
        "ui.language.body": "§7언어를 선택하세요:",
        "ui.language.saved": "§a언어가 §f{lang}§a(으)로 설정되었습니다.",

        "ui.main.title": "§l§6ADVANCED JOBS §r§7v5.3.0",
        "ui.main.welcome": "§7환영합니다, §e{player}§7!",
        "ui.main.active_jobs": "§6활성 직업",
        "ui.main.total_earnings": "§6총 수입",
        "ui.main.quests_completed": "§6완료한 퀘스트",
        "ui.main.achievements": "§6업적",

        "btn.my_jobs": "§a내 직업\n§7관리",
        "btn.browse_jobs": "§e직업 찾기\n§7새 직업 선택",
        "btn.leave_job": "§c직업 나가기\n§7그만두기",
        "btn.statistics": "§b통계\n§7개요",
        "btn.upgrades": "§5업그레이드\n§7능력 강화",
        "btn.quests": "§d퀘스트\n§7일일 도전",
        "btn.achievements": "§6업적\n§7진행 상황",
        "btn.activity": "§3활동\n§7제한 및 상태",
        "btn.language": "§b언어\n§7언어 변경",
        "btn.help": "§9도움말\n§7플레이 방법",
        "btn.close": "§c닫기",
        "btn.back": "§7« 뒤로",

        "error.data": "§c데이터를 불러오지 못했습니다. 다시 접속하세요.",

        "job.joined": "§a* {job}§a 에 참여했습니다! §7{command} 명령어로 메뉴를 여세요.",
        "job.left": "§6{job}§6 을(를) 나갔습니다. §7쿨다운: 5분",
        "limit.reached": "§c[!] {job}§c 활동 제한에 도달했습니다. §7시간이 지나면 회복됩니다.",
        "levelup": "§6* §l레벨 업!§r §6{job} §e레벨 {level} 달성!",

        "quests.new": "§e새 일일 퀘스트가 있습니다! §7메뉴에서 확인하세요.",
        "quests.complete": "§d* §l퀘스트 완료!§r §d{quest}",
        "achievement.unlocked": "§6* §l업적 달성!§r §6{achievement}",

        "money.balance": "§2잔액: §a{amount}",
        "money.pay.usage": "§c사용법: !jpay <플레이어> <금액>",
        "money.pay.invalid": "§c금액이 올바르지 않습니다",
        "money.pay.self": "§c자기 자신에게는 보낼 수 없습니다",
        "money.pay.not_found": "§c플레이어 \"{player}\" 를 찾을 수 없습니다",
        "money.pay.insufficient": "§c잔액이 부족합니다. 잔액: {balance}",
        "money.pay.sent": "§a{player} 에게 {amount} 보냈습니다",
        "money.pay.received": "§a{player} 로부터 {amount} 받았습니다",

        "admin.no_permission": "§c권한이 없습니다",
        "admin.usage": "§c사용법: !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "채굴",
        "reward.woodcutting": "벌목",
        "reward.farming": "농사",
        "reward.building": "건축",
        "reward.hunting": "사냥",
        "reward.fishing": "낚시",
        "reward.treasure": "보물",
        "reward.crafting": "제작",
        "reward.enchanting": "인챈트",
        "reward.trading": "거래",
        "reward.exploration": "탐험"
    },
    id: {
        "system.loaded": "§aPekerjaan Lanjutan dimuat!",
        "system.use_clock": "§eKetik {command} untuk membuka menu!",
        "ui.language.title": "§l§bBahasa",
        "ui.language.body": "§7Pilih bahasa:",
        "ui.language.saved": "§aBahasa diatur ke §f{lang}§a.",

        "ui.main.title": "§l§6ADVANCED JOBS §r§7v5.3.0",
        "ui.main.welcome": "§7Selamat datang, §e{player}§7!",
        "ui.main.active_jobs": "§6Pekerjaan aktif",
        "ui.main.total_earnings": "§6Total pendapatan",
        "ui.main.quests_completed": "§6Misi selesai",
        "ui.main.achievements": "§6Pencapaian",

        "btn.my_jobs": "§aPekerjaanku\n§7Kelola",
        "btn.browse_jobs": "§eCari pekerjaan\n§7Pilih profesi",
        "btn.leave_job": "§cKeluar pekerjaan\n§7Tinggalkan profesi",
        "btn.statistics": "§bStatistik\n§7Ringkasan",
        "btn.upgrades": "§5Upgrade\n§7Tingkatkan kemampuan",
        "btn.quests": "§dMisi\n§7Tantangan harian",
        "btn.achievements": "§6Pencapaian\n§7Lacak progres",
        "btn.activity": "§3Aktivitas\n§7Batas & status",
        "btn.language": "§bBahasa\n§7Ubah bahasa",
        "btn.help": "§9Bantuan\n§7Cara bermain",
        "btn.close": "§cTutup",
        "btn.back": "§7« Kembali",

        "error.data": "§cGagal memuat data. Silakan masuk lagi.",

        "job.joined": "§a* Bergabung dengan {job}§a! §7Ketik {command} untuk membuka menu.",
        "job.left": "§6Keluar dari {job}§6. §7Cooldown: 5 menit",
        "limit.reached": "§c[!] Batas aktivitas tercapai untuk {job}§c! §7Pulih seiring waktu.",
        "levelup": "§6* §lNAIK LEVEL!§r §6{job} §emencapai level {level}!",

        "quests.new": "§eMisi harian baru tersedia! §7Cek menu pekerjaan.",
        "quests.complete": "§d* §lMISI SELESAI!§r §d{quest}",
        "achievement.unlocked": "§6* §lPENCAPAIAN TERBUKA!§r §6{achievement}",

        "money.balance": "§2Saldo: §a{amount}",
        "money.pay.usage": "§cCara: !jpay <pemain> <jumlah>",
        "money.pay.invalid": "§cJumlah tidak valid",
        "money.pay.self": "§cTidak bisa membayar diri sendiri",
        "money.pay.not_found": "§cPemain \"{player}\" tidak ditemukan",
        "money.pay.insufficient": "§cSaldo tidak cukup. Saldo: {balance}",
        "money.pay.sent": "§aMembayar {player} {amount}",
        "money.pay.received": "§aMenerima {amount} dari {player}",

        "admin.no_permission": "§cTidak ada izin",
        "admin.usage": "§cCara: !jadmin <give|take|reset|reload> [args]",

        "reward.mining": "Menambang",
        "reward.woodcutting": "Menebang",
        "reward.farming": "Bertani",
        "reward.building": "Membangun",
        "reward.hunting": "Berburu",
        "reward.fishing": "Memancing",
        "reward.treasure": "Harta",
        "reward.crafting": "Membuat",
        "reward.enchanting": "Enchant",
        "reward.trading": "Berdagang",
        "reward.exploration": "Menjelajah"
    }
};

// Extra UI titles (kept separate to keep the main I18N table readable)
const I18N_EXTRA = {
    en: {
        "title.my_jobs": "§l§aMy Jobs",
        "title.browse_jobs": "§l§eBrowse Jobs",
        "title.leave_job": "§l§cLeave Job",
        "title.statistics": "§l§bStatistics",
        "title.upgrades": "§l§5Upgrades",
        "title.quests": "§l§dQuests",
        "title.achievements": "§l§6Achievements",
        "title.activity": "§l§3Activity",
        "title.help": "§l§9Help"
    },
    zh_CN: {
        "title.my_jobs": "§l§a我的职业",
        "title.browse_jobs": "§l§e浏览职业",
        "title.leave_job": "§l§c离开职业",
        "title.statistics": "§l§b统计",
        "title.upgrades": "§l§5升级",
        "title.quests": "§l§d任务",
        "title.achievements": "§l§6成就",
        "title.activity": "§l§3活跃度",
        "title.help": "§l§9帮助"
    },
    es: {
        "title.my_jobs": "§l§aMis trabajos",
        "title.browse_jobs": "§l§eExplorar trabajos",
        "title.leave_job": "§l§cDejar trabajo",
        "title.statistics": "§l§bEstadísticas",
        "title.upgrades": "§l§5Mejoras",
        "title.quests": "§l§dMisiones",
        "title.achievements": "§l§6Logros",
        "title.activity": "§l§3Actividad",
        "title.help": "§l§9Ayuda"
    },
    pt_BR: {
        "title.my_jobs": "§l§aMeus empregos",
        "title.browse_jobs": "§l§eVer empregos",
        "title.leave_job": "§l§cSair do emprego",
        "title.statistics": "§l§bEstatísticas",
        "title.upgrades": "§l§5Melhorias",
        "title.quests": "§l§dMissões",
        "title.achievements": "§l§6Conquistas",
        "title.activity": "§l§3Atividade",
        "title.help": "§l§9Ajuda"
    },
    ru: {
        "title.my_jobs": "§l§aМои профессии",
        "title.browse_jobs": "§l§eВыбрать профессию",
        "title.leave_job": "§l§cПокинуть",
        "title.statistics": "§l§bСтатистика",
        "title.upgrades": "§l§5Улучшения",
        "title.quests": "§l§dКвесты",
        "title.achievements": "§l§6Достижения",
        "title.activity": "§l§3Активность",
        "title.help": "§l§9Помощь"
    },
    ja: {
        "title.my_jobs": "§l§a自分の職業",
        "title.browse_jobs": "§l§e職業を探す",
        "title.leave_job": "§l§c職業をやめる",
        "title.statistics": "§l§b統計",
        "title.upgrades": "§l§5アップグレード",
        "title.quests": "§l§dクエスト",
        "title.achievements": "§l§6実績",
        "title.activity": "§l§3アクティビティ",
        "title.help": "§l§9ヘルプ"
    },
    de: {
        "title.my_jobs": "§l§aMeine Jobs",
        "title.browse_jobs": "§l§eJobs durchsuchen",
        "title.leave_job": "§l§cJob verlassen",
        "title.statistics": "§l§bStatistik",
        "title.upgrades": "§l§5Upgrades",
        "title.quests": "§l§dQuests",
        "title.achievements": "§l§6Errungenschaften",
        "title.activity": "§l§3Aktivität",
        "title.help": "§l§9Hilfe"
    },
    fr: {
        "title.my_jobs": "§l§aMes jobs",
        "title.browse_jobs": "§l§eParcourir",
        "title.leave_job": "§l§cQuitter",
        "title.statistics": "§l§bStatistiques",
        "title.upgrades": "§l§5Améliorations",
        "title.quests": "§l§dQuêtes",
        "title.achievements": "§l§6Succès",
        "title.activity": "§l§3Activité",
        "title.help": "§l§9Aide"
    },
    ko: {
        "title.my_jobs": "§l§a내 직업",
        "title.browse_jobs": "§l§e직업 찾기",
        "title.leave_job": "§l§c직업 나가기",
        "title.statistics": "§l§b통계",
        "title.upgrades": "§l§5업그레이드",
        "title.quests": "§l§d퀘스트",
        "title.achievements": "§l§6업적",
        "title.activity": "§l§3활동",
        "title.help": "§l§9도움말"
    },
    id: {
        "title.my_jobs": "§l§aPekerjaanku",
        "title.browse_jobs": "§l§eCari pekerjaan",
        "title.leave_job": "§l§cKeluar pekerjaan",
        "title.statistics": "§l§bStatistik",
        "title.upgrades": "§l§5Upgrade",
        "title.quests": "§l§dMisi",
        "title.achievements": "§l§6Pencapaian",
        "title.activity": "§l§3Aktivitas",
        "title.help": "§l§9Bantuan"
    }
};

for (const [lang, entries] of Object.entries(I18N_EXTRA)) {
    I18N[lang] = { ...(I18N[lang] || {}), ...entries };
}

function t(player, key, params = {}) {
    const lang = getPlayerLang(player);
    const table = I18N[lang] || I18N[LANG.DEFAULT];
    const fallback = I18N[LANG.DEFAULT] || {};
    const raw = table?.[key] ?? fallback?.[key] ?? key;
    return template(raw, params);
}

const JOB_NAME_I18N = {
    en: {
        miner: "Miner",
        crafter: "Crafter",
        farmer: "Farmer",
        fisherman: "Fisherman",
        hunter: "Hunter",
        explorer: "Explorer",
        builder: "Builder",
        enchanter: "Enchanter",
        merchant: "Merchant",
        blacksmith: "Blacksmith",
        alchemist: "Alchemist",
        lumberjack: "Lumberjack"
    },
    zh_CN: {
        miner: "矿工",
        crafter: "工匠",
        farmer: "农夫",
        fisherman: "渔夫",
        hunter: "猎人",
        explorer: "探险家",
        builder: "建造师",
        enchanter: "附魔师",
        merchant: "商人",
        blacksmith: "铁匠",
        alchemist: "炼金术士",
        lumberjack: "伐木工"
    },
    es: {
        miner: "Minero",
        crafter: "Artesano",
        farmer: "Granjero",
        fisherman: "Pescador",
        hunter: "Cazador",
        explorer: "Explorador",
        builder: "Constructor",
        enchanter: "Encantador",
        merchant: "Mercader",
        blacksmith: "Herrero",
        alchemist: "Alquimista",
        lumberjack: "Leñador"
    },
    pt_BR: {
        miner: "Minerador",
        crafter: "Artesão",
        farmer: "Fazendeiro",
        fisherman: "Pescador",
        hunter: "Caçador",
        explorer: "Explorador",
        builder: "Construtor",
        enchanter: "Encantador",
        merchant: "Mercador",
        blacksmith: "Ferreiro",
        alchemist: "Alquimista",
        lumberjack: "Lenhador"
    },
    ru: {
        miner: "Шахтёр",
        crafter: "Ремесленник",
        farmer: "Фермер",
        fisherman: "Рыбак",
        hunter: "Охотник",
        explorer: "Исследователь",
        builder: "Строитель",
        enchanter: "Чародей",
        merchant: "Торговец",
        blacksmith: "Кузнец",
        alchemist: "Алхимик",
        lumberjack: "Лесоруб"
    },
    ja: {
        miner: "鉱夫",
        crafter: "職人",
        farmer: "農家",
        fisherman: "漁師",
        hunter: "狩人",
        explorer: "探検家",
        builder: "建築家",
        enchanter: "付与術師",
        merchant: "商人",
        blacksmith: "鍛冶屋",
        alchemist: "錬金術師",
        lumberjack: "木こり"
    },
    de: {
        miner: "Bergmann",
        crafter: "Handwerker",
        farmer: "Bauer",
        fisherman: "Fischer",
        hunter: "Jäger",
        explorer: "Entdecker",
        builder: "Baumeister",
        enchanter: "Verzauberer",
        merchant: "Händler",
        blacksmith: "Schmied",
        alchemist: "Alchemist",
        lumberjack: "Holzfäller"
    },
    fr: {
        miner: "Mineur",
        crafter: "Artisan",
        farmer: "Fermier",
        fisherman: "Pêcheur",
        hunter: "Chasseur",
        explorer: "Explorateur",
        builder: "Bâtisseur",
        enchanter: "Enchanteur",
        merchant: "Marchand",
        blacksmith: "Forgeron",
        alchemist: "Alchimiste",
        lumberjack: "Bûcheron"
    },
    ko: {
        miner: "광부",
        crafter: "제작자",
        farmer: "농부",
        fisherman: "어부",
        hunter: "사냥꾼",
        explorer: "탐험가",
        builder: "건축가",
        enchanter: "인챈터",
        merchant: "상인",
        blacksmith: "대장장이",
        alchemist: "연금술사",
        lumberjack: "벌목꾼"
    },
    id: {
        miner: "Penambang",
        crafter: "Perajin",
        farmer: "Petani",
        fisherman: "Pemancing",
        hunter: "Pemburu",
        explorer: "Penjelajah",
        builder: "Pembangun",
        enchanter: "Penyihir",
        merchant: "Pedagang",
        blacksmith: "Pandai Besi",
        alchemist: "Ahli Alkimia",
        lumberjack: "Penebang Kayu"
    }
};

function jobNamePlain(player, jobId) {
    const lang = getPlayerLang(player);
    const table = JOB_NAME_I18N[lang] || JOB_NAME_I18N[LANG.DEFAULT];
    return table?.[jobId] || JOB_NAME_I18N[LANG.DEFAULT]?.[jobId] || jobId;
}

function jobNameColored(player, jobId) {
    const job = JOBS[jobId.toUpperCase()];
    const plain = jobNamePlain(player, jobId);
    return `${job.color}${plain}§r`;
}

const CATEGORY_I18N = {
    en: { gathering: "Gathering", crafting: "Crafting", combat: "Combat", adventure: "Adventure", magic: "Magic", trading: "Trading" },
    zh_CN: { gathering: "采集", crafting: "合成", combat: "战斗", adventure: "冒险", magic: "魔法", trading: "交易" },
    es: { gathering: "Recolección", crafting: "Crafteo", combat: "Combate", adventure: "Aventura", magic: "Magia", trading: "Comercio" },
    pt_BR: { gathering: "Coleta", crafting: "Artesanato", combat: "Combate", adventure: "Aventura", magic: "Magia", trading: "Comércio" },
    ru: { gathering: "Сбор", crafting: "Крафт", combat: "Бой", adventure: "Приключение", magic: "Магия", trading: "Торговля" },
    ja: { gathering: "採集", crafting: "クラフト", combat: "戦闘", adventure: "冒険", magic: "魔法", trading: "取引" },
    de: { gathering: "Sammeln", crafting: "Crafting", combat: "Kampf", adventure: "Abenteuer", magic: "Magie", trading: "Handel" },
    fr: { gathering: "Collecte", crafting: "Craft", combat: "Combat", adventure: "Aventure", magic: "Magie", trading: "Commerce" },
    ko: { gathering: "채집", crafting: "제작", combat: "전투", adventure: "모험", magic: "마법", trading: "거래" },
    id: { gathering: "Mengumpulkan", crafting: "Membuat", combat: "Pertempuran", adventure: "Petualangan", magic: "Sihir", trading: "Perdagangan" }
};

function categoryName(player, category) {
    const lang = getPlayerLang(player);
    return (CATEGORY_I18N[lang] || CATEGORY_I18N[LANG.DEFAULT])?.[category] || category;
}

function addExperienceReward(player, amount) {
    if (!player || amount === 0) return 0;
    try {
        const safeAmount = Math.max(-16777216, Math.min(16777216, amount));
        player.addExperience(safeAmount);
        return safeAmount;
    } catch (error) {
        console.error('[Jobs] Failed to apply vanilla XP reward:', error);
        return 0;
    }
}

function formatHistoryTimestamp(timestamp) {
    const date = new Date(timestamp || Date.now());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
}

function getHistoryIcon(type) {
    switch (type) {
        case 'reward': return '§a$';
        case 'quest': return '§dQ';
        case 'levelup': return '§6L';
        case 'achievement': return '§6A';
        case 'salary': return '§bS';
        default: return '§7•';
    }
}

// ==========================================
// CONFIGURATION
// ==========================================

const SCOREBOARD_OBJECTIVE_ID_PATTERN = /^[A-Za-z0-9_]{1,16}$/;
const FALLBACK_CURRENCY_OBJECTIVE_ID = 'money';
const CURRENCY_DYNAMIC_PROPERTY = JOBS_ADDON_CONFIG.currency?.dynamicProperty || 'jobs_currency_objective_v1';
const CURRENCY_MIGRATION_MODES = ['copy', 'move', 'empty'];
const SCOREBOARD_MIN = -2147483648;
const SCOREBOARD_MAX = 2147483647;
const MAX_CURRENCY_TRANSACTION = 1000000000;

function validateScoreboardObjectiveId(raw) {
    const id = String(raw ?? '').trim();
    if (!id) return { ok: false, id: '', reason: 'Objective name is required.' };
    if (!SCOREBOARD_OBJECTIVE_ID_PATTERN.test(id)) {
        return {
            ok: false,
            id,
            reason: 'Use 1-16 characters: letters, numbers, and underscore only.'
        };
    }
    return { ok: true, id, reason: '' };
}

function getConfiguredDefaultCurrencyObjectiveId() {
    const fromCurrencyConfig = JOBS_ADDON_CONFIG.currency?.defaultObjective;
    const fromRewardConfig = JOBS_ADDON_CONFIG.rewards?.defaultScoreObjective;
    const validated = validateScoreboardObjectiveId(fromCurrencyConfig || fromRewardConfig || FALLBACK_CURRENCY_OBJECTIVE_ID);
    return validated.ok ? validated.id : FALLBACK_CURRENCY_OBJECTIVE_ID;
}

/**
 * Central configuration object for easy customization
 * All time values are in ticks (20 ticks = 1 second)
 */
const CONFIG = {
    // Core Settings
    OBJECTIVE_ID: getConfiguredDefaultCurrencyObjectiveId(),
    MAX_JOBS: 3,
    MAX_LEVEL: 100,
    LEVEL_BONUS_PERCENT: 10,

    // Timing (ticks)
    TICKS_PER_SECOND: 20,
    COOLDOWN_TICKS: 6000,
    SALARY_INTERVAL_TICKS: 24000,
    SAVE_INTERVAL_TICKS: 1200,
    QUEST_RESET_TICKS: 1728000,
    LIMIT_REGEN_INTERVAL: 600,
    CLEANUP_INTERVAL: 6000,
    INTERACTION_CONTEXT_TICKS: 200,
    FISHING_WINDOW_TICKS: 400,
    BUILDER_LOOP_COOLDOWN_TICKS: 1200,

    // Timers (milliseconds)
    EXPLORER_DIMENSION_COOLDOWN_MS: 10 * 60 * 1000,

    // Job Limits (anti-spam)
    JOB_LIMIT_ENABLED: true,
    BASE_JOB_LIMIT: 30,
    LIMIT_REGEN_RATE: 2,

    // Features
    ENABLE_DAILY_SALARY: true,
    ENABLE_QUESTS: true,
    ENABLE_JOB_UPGRADES: true,
    ENABLE_ACHIEVEMENTS: true,
    ENABLE_LEADERBOARD: JOBS_ADDON_CONFIG.leaderboard?.enableSidebarMoney ?? false,
    LEADERBOARD_GUI_ENTRIES: JOBS_ADDON_CONFIG.leaderboard?.guiEntries ?? 10,
    HISTORY_MAX_ENTRIES: JOBS_ADDON_CONFIG.history?.maxEntries ?? 30,
    HISTORY_GUI_ENTRIES: JOBS_ADDON_CONFIG.history?.guiEntries ?? 12,
    REQUIRE_SNEAK_FOR_CLOCK_MENU: JOBS_ADDON_CONFIG.menu.requireSneakForClockMenu ?? true,
    UPGRADE_COSTS_ENABLED: true,
    UPGRADE_COST_PER_LEVEL: 40,

    // Admin
    ADMIN_TAG: "admin",
    DEBUG_MODE: false
};

const MENU_COMMAND = "/job";
const COMMAND_PERMISSION_LEVELS = {
    Any: CommandPermissionLevel.Any,
    GameDirectors: CommandPermissionLevel.GameDirectors,
    Admin: CommandPermissionLevel.Admin,
    Host: CommandPermissionLevel.Host,
    Owner: CommandPermissionLevel.Owner
};

function getActiveCurrencyObjectiveId() {
    try {
        const stored = world.getDynamicProperty(CURRENCY_DYNAMIC_PROPERTY);
        const validated = validateScoreboardObjectiveId(stored);
        if (validated.ok) return validated.id;
        if (stored !== undefined && stored !== null && String(stored).length > 0) {
            console.warn(`[Jobs] Ignoring invalid saved currency objective "${stored}": ${validated.reason}`);
        }
    } catch (error) {
        if (CONFIG.DEBUG_MODE) console.warn('[Jobs] Failed to read currency objective:', error);
    }
    return CONFIG.OBJECTIVE_ID;
}

function isDefaultCurrencyObjective(objectiveId) {
    const id = String(objectiveId ?? '').trim().toLowerCase();
    return !id || id === 'default' || id === 'currency' || id === 'money' || id === CONFIG.OBJECTIVE_ID.toLowerCase();
}

function resolveScoreObjectiveId(objectiveId) {
    if (isDefaultCurrencyObjective(objectiveId)) return getActiveCurrencyObjectiveId();
    const validated = validateScoreboardObjectiveId(objectiveId);
    if (!validated.ok) {
        console.warn(`[Jobs] Invalid reward scoreboard objective "${objectiveId}": ${validated.reason}`);
        return null;
    }
    return validated.id;
}

function getCurrencyDisplayName() {
    const activeObjectiveId = getActiveCurrencyObjectiveId();
    const configured = String(JOBS_ADDON_CONFIG.currency?.displayName || '').trim();
    if (configured && activeObjectiveId === CONFIG.OBJECTIVE_ID) return configured;
    return humanizeIdentifier(activeObjectiveId);
}

function formatCurrencyAmount(amount) {
    return `${formatNumber(amount)} ${getCurrencyDisplayName()}`;
}

function getObjectiveDisplayName(objectiveId) {
    return objectiveId === getActiveCurrencyObjectiveId()
        ? `§6${getCurrencyDisplayName()}`
        : humanizeIdentifier(objectiveId);
}

function ensureScoreObjective(objectiveId, displayName = null) {
    const validated = validateScoreboardObjectiveId(objectiveId);
    if (!validated.ok) return null;

    try {
        let objective = world.scoreboard.getObjective(validated.id);
        if (!objective) objective = world.scoreboard.addObjective(validated.id, displayName || getObjectiveDisplayName(validated.id));
        return objective;
    } catch (error) {
        console.error(`[Jobs] Failed to create/get scoreboard objective "${validated.id}":`, error);
        return null;
    }
}

function getScoreSafe(objective, identity) {
    if (!objective || !identity) return 0;
    try {
        return objective.getScore(identity) || 0;
    } catch {
        return 0;
    }
}

function clampScore(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(SCOREBOARD_MIN, Math.min(SCOREBOARD_MAX, Math.trunc(numeric)));
}

function parsePositiveCurrencyAmount(raw) {
    if (typeof raw === 'number') {
        if (!Number.isSafeInteger(raw) || raw <= 0 || raw > MAX_CURRENCY_TRANSACTION) return null;
        return raw;
    }

    const text = String(raw ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_CURRENCY_TRANSACTION) return null;
    return value;
}

function setScoreDelta(player, objectiveId, amount) {
    if (!player?.scoreboardIdentity) return 0;

    const resolvedObjectiveId = resolveScoreObjectiveId(objectiveId);
    if (!resolvedObjectiveId) return 0;

    if (resolvedObjectiveId === 'money') {
        const delta = Math.trunc(Number(amount));
        if (!Number.isFinite(delta) || delta === 0) return 0;
        if (delta > 0) return addMoney(player, delta) ? delta : 0;
        return removeMoney(player, -delta) ? delta : 0;
    }

    const delta = Number(amount);
    if (!Number.isFinite(delta) || delta === 0) return 0;

    const objective = ensureScoreObjective(resolvedObjectiveId);
    if (!objective) return 0;

    try {
        const current = getScoreSafe(objective, player.scoreboardIdentity);
        const next = current + Math.trunc(delta);
        if (next < SCOREBOARD_MIN || next > SCOREBOARD_MAX) return 0;
        objective.setScore(player.scoreboardIdentity, next);
        return next - current;
    } catch (error) {
        console.error(`[Jobs] Failed to update score for ${player.name}:`, error);
        return 0;
    }
}

function getCurrencyScore(player) {
    if (!player?.scoreboardIdentity) return 0;
    if (getActiveCurrencyObjectiveId() === 'money') {
        const money = getFullMoney(player);
        return money > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(money);
    }
    const objective = world.scoreboard.getObjective(getActiveCurrencyObjectiveId());
    return getScoreSafe(objective, player.scoreboardIdentity);
}

function migrateCurrencyObjective(newObjectiveId, mode = 'copy') {
    const validated = validateScoreboardObjectiveId(newObjectiveId);
    if (!validated.ok) return { ok: false, reason: validated.reason };

    const migrationMode = CURRENCY_MIGRATION_MODES.includes(String(mode || '').toLowerCase())
        ? String(mode || '').toLowerCase()
        : 'copy';

    const oldObjectiveId = getActiveCurrencyObjectiveId();
    const targetObjective = ensureScoreObjective(validated.id, `§6${humanizeIdentifier(validated.id)}`);
    if (!targetObjective) return { ok: false, reason: 'Failed to create the target scoreboard objective.' };

    let migrated = 0;
    if (oldObjectiveId !== validated.id && migrationMode !== 'empty') {
        try {
            const sourceObjective = world.scoreboard.getObjective(oldObjectiveId);
            if (sourceObjective) {
                const identities = typeof sourceObjective.getParticipants === 'function'
                    ? sourceObjective.getParticipants()
                    : world.getAllPlayers().map(player => player.scoreboardIdentity).filter(Boolean);

                const seen = new Set();
                for (const identity of identities) {
                    const key = identity?.id ?? identity?.displayName ?? String(identity);
                    if (!identity || seen.has(key)) continue;
                    seen.add(key);

                    const score = getScoreSafe(sourceObjective, identity);
                    targetObjective.setScore(identity, clampScore(score));
                    if (migrationMode === 'move') sourceObjective.setScore(identity, 0);
                    migrated++;
                }
            }
        } catch (error) {
            return { ok: false, reason: `Migration failed: ${error}` };
        }
    }

    try {
        world.setDynamicProperty(CURRENCY_DYNAMIC_PROPERTY, validated.id);
    } catch (error) {
        return { ok: false, reason: `Failed to save currency objective: ${error}` };
    }

    return { ok: true, oldObjectiveId, newObjectiveId: validated.id, mode: migrationMode, migrated };
}

function getRewardActions(source, jobId = null) {
    const rewardsConfig = JOBS_ADDON_CONFIG.rewards || {};
    const defaults = Array.isArray(rewardsConfig[source]) ? rewardsConfig[source] : [];
    const perJob = Array.isArray(rewardsConfig.perJob?.[jobId]?.[source])
        ? rewardsConfig.perJob[jobId][source]
        : [];
    return [...defaults, ...perJob];
}

function getRewardActionSourceValue(action, context) {
    switch (action.amountSource) {
        case 'base':
            return Number(context.baseAmount ?? 0);
        case 'configured':
            return Number(context.configuredAmount ?? 0);
        case 'computed':
            return Number(context.computedAmount ?? context.configuredAmount ?? 0);
        case 'fixed':
            return Number(action.amount ?? 0);
        default:
            if (action.amount !== undefined) return Number(action.amount);
            if (action.type === 'score') return Number(context.computedAmount ?? context.configuredAmount ?? 0);
            return 0;
    }
}

function roundRewardValue(value, mode = 'floor') {
    switch (mode) {
        case 'ceil':
            return Math.ceil(value);
        case 'round':
            return Math.round(value);
        default:
            return Math.floor(value);
    }
}

function resolveRewardActionAmount(action, context) {
    const baseValue = getRewardActionSourceValue(action, context);
    const multiplier = Number(action.multiplier ?? 1);
    let amount = roundRewardValue(baseValue * multiplier, action.round || 'floor');
    if (action.min !== undefined) amount = Math.max(Number(action.min), amount);
    if (action.max !== undefined) amount = Math.min(Number(action.max), amount);
    return Number.isFinite(amount) ? amount : 0;
}

function addScoreReward(player, objectiveId, amount) {
    return Math.max(0, setScoreDelta(player, objectiveId, amount));
}


function giveConfiguredItemReward(player, itemId, amount) {
    if (!player || !itemId || amount <= 0) return 0;
    try {
        const inventory = player.getComponent('minecraft:inventory')?.container;
        if (!inventory) return 0;

        let remaining = amount;
        let awarded = 0;

        while (remaining > 0) {
            const stackAmount = Math.min(remaining, 64);
            const stack = new ItemStack(itemId, stackAmount);
            const leftover = inventory.addItem(stack);
            awarded += stackAmount - (leftover?.amount || 0);
            if (leftover) {
                const dropLocation = {
                    x: player.location.x,
                    y: player.location.y + 1,
                    z: player.location.z
                };
                player.dimension?.spawnItem?.(leftover, dropLocation);
            }
            remaining -= stackAmount;
        }

        return awarded;
    } catch (error) {
        console.error(`[Jobs] Failed to give item reward (${itemId}):`, error);
        return 0;
    }
}

function humanizeIdentifier(raw) {
    return String(raw || '')
        .replace(/^minecraft:/, '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function applyConfiguredRewardPayouts(player, source, context = {}) {
    const payouts = [];
    const actions = getRewardActions(source, context.jobId ?? null);

    for (const action of actions) {
        if (!action?.type) continue;
        const amount = resolveRewardActionAmount(action, context);
        if (amount <= 0) continue;

        if (action.type === 'score') {
            const objective = resolveScoreObjectiveId(action.objective);
            if (!objective) continue;
            const awarded = addScoreReward(player, objective, amount);
            if (awarded > 0) payouts.push({ type: 'score', objective, amount: awarded });
            continue;
        }

        if (action.type === 'item') {
            const awarded = giveConfiguredItemReward(player, action.itemId, amount);
            if (awarded > 0) payouts.push({ type: 'item', itemId: action.itemId, amount: awarded });
            continue;
        }

        if (action.type === 'xp' || action.type === 'experience') {
            const awarded = addExperienceReward(player, amount);
            if (awarded !== 0) payouts.push({ type: 'xp', amount: awarded });
        }
    }

    return {
        source,
        points: Number(context.computedAmount ?? context.configuredAmount ?? 0),
        payouts
    };
}

function formatRewardPart(payout) {
    if (!payout) return '';
    if (payout.type === 'score') {
        return payout.objective === getActiveCurrencyObjectiveId()
            ? formatCurrencyAmount(payout.amount)
            : `${formatNumber(payout.amount)} ${humanizeIdentifier(payout.objective)}`;
    }
    if (payout.type === 'item') {
        return `${formatNumber(payout.amount)}x ${humanizeIdentifier(payout.itemId)}`;
    }
    if (payout.type === 'xp') {
        return `${formatNumber(payout.amount)} XP`;
    }
    return '';
}

function formatRewardSummary(result) {
    if (!result?.payouts?.length) return '';
    return result.payouts.map(formatRewardPart).filter(Boolean).join(' + ');
}

function formatRewardToast(result, categoryLabel) {
    const summary = formatRewardSummary(result);
    if (!summary) return '';
    return `§a${summary.replace(/ \+ /g, ' §7+ §a')} §7(${categoryLabel})`;
}

function getRewardLines(result) {
    if (!result?.payouts?.length) return [];
    return result.payouts.map(payout => `§a• ${formatRewardPart(payout)}`);
}

const JOB_SOUND_EFFECTS = {
    menuOpen: { id: 'random.orb', options: { volume: 0.35, pitch: 1.15 } },
    menuSelect: { id: 'random.orb', options: { volume: 0.4, pitch: 1.0 } },
    success: { id: 'random.orb', options: { volume: 0.55, pitch: 1.18 } },
    warning: { id: 'random.orb', options: { volume: 0.45, pitch: 0.6 } },
    levelUp: { id: 'random.levelup', options: { volume: 0.8, pitch: 1.0 } },
    quest: { id: 'random.levelup', options: { volume: 0.65, pitch: 1.08 } },
    achievement: { id: 'ui.toast.challenge_complete', options: { volume: 0.8, pitch: 1.0 } },
    salary: { id: 'random.levelup', options: { volume: 0.5, pitch: 1.15 } },
    paySend: { id: 'random.orb', options: { volume: 0.5, pitch: 0.95 } },
    payReceive: { id: 'random.orb', options: { volume: 0.55, pitch: 1.25 } }
};

function playJobSound(player, key, overrides = {}) {
    const sound = JOB_SOUND_EFFECTS[key];
    if (!player || typeof player.playSound !== 'function' || !sound) return;

    try {
        player.playSound(sound.id, { ...(sound.options || {}), ...(overrides || {}) });
    } catch (error) {
        console.warn(`[Jobs] Failed to play sound ${sound.id} (${key})`, error);
    }
}

const isJobsSystemEnabled = () => isMemberFeatureEnabled('job');

let jobsSystem;

function ensureJobsSystem() {
    if (!jobsSystem && isJobsSystemEnabled()) jobsSystem = new JobsSystem();
    jobsSystem?.syncFeatureState?.();
    return jobsSystem;
}

function openJobsMenu(player) {
    if (!isJobsSystemEnabled()) {
        player?.sendMessage('§cJobs system is currently disabled by an admin.');
        return;
    }
    ensureJobsSystem();
    system.runTimeout(() => {
        if (!player || !jobsSystem?.gui) return;
        playJobSound(player, 'menuOpen');
        if (!hasPlayerLang(player)) jobsSystem.gui.showLanguageMenu(player, { returnToMain: true });
        else jobsSystem.gui.showMainMenu(player);
    }, 2);
}

// ==========================================
// JOB DEFINITIONS
// ==========================================

/**
 * Comprehensive job definitions with balanced progression
 * Each job has unique upgrades, balanced salaries, and distinct playstyles
 */
function getDefaultNotificationSettings() {
    return {
        rewardChat: JOBS_ADDON_CONFIG.notifications?.defaults?.rewardChat ?? true,
        rewardActionBar: JOBS_ADDON_CONFIG.notifications?.defaults?.rewardActionBar ?? true,
        questMessages: JOBS_ADDON_CONFIG.notifications?.defaults?.questMessages ?? true,
        achievementMessages: JOBS_ADDON_CONFIG.notifications?.defaults?.achievementMessages ?? true,
        levelUpMessages: JOBS_ADDON_CONFIG.notifications?.defaults?.levelUpMessages ?? true,
        salaryMessages: JOBS_ADDON_CONFIG.notifications?.defaults?.salaryMessages ?? true,
        systemTips: JOBS_ADDON_CONFIG.notifications?.defaults?.systemTips ?? true
    };
}

function normalizeNotificationSettings(settings = {}) {
    return { ...getDefaultNotificationSettings(), ...(settings || {}) };
}

function normalizeHistoryEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
            type: String(entry.type || 'note'),
            title: String(entry.title || 'Activity'),
            detail: String(entry.detail || ''),
            jobId: entry.jobId ? String(entry.jobId) : null,
            timestamp: Number(entry.timestamp || Date.now())
        }));
}

function matchesConfiguredUpgrade(itemType, match = null) {
    if (!match) return true;
    const source = String(itemType || '').toLowerCase();
    const includesAny = Array.isArray(match.includesAny) ? match.includesAny.map(value => String(value).toLowerCase()) : [];
    const equalsAny = Array.isArray(match.equalsAny) ? match.equalsAny.map(value => String(value).toLowerCase()) : [];
    if (equalsAny.length > 0 && equalsAny.includes(source)) return true;
    if (includesAny.length > 0 && includesAny.some(value => source.includes(value))) return true;
    return equalsAny.length === 0 && includesAny.length === 0;
}

function normalizeUpgrade(upgrade) {
    return {
        level: Number(upgrade?.level || 1),
        name: String(upgrade?.name || 'Upgrade'),
        bonus: String(upgrade?.bonus || ''),
        multiplier: Number(upgrade?.multiplier || 1),
        match: upgrade?.match || null,
        condition: (type) => matchesConfiguredUpgrade(type, upgrade?.match || null)
    };
}

function normalizeJobDefinitions(definitions = {}) {
    const normalized = {};
    for (const [key, value] of Object.entries(definitions || {})) {
        if (!value?.id) continue;
        normalized[key.toUpperCase()] = {
            ...value,
            id: String(value.id),
            name: String(value.name || value.id),
            description: String(value.description || ''),
            icon: String(value.icon || 'paper'),
            baseSalary: Number(value.baseSalary || 0),
            color: String(value.color || '§f'),
            category: String(value.category || 'general'),
            upgrades: Array.isArray(value.upgrades) ? value.upgrades.map(normalizeUpgrade) : []
        };
    }
    return normalized;
}

const JOBS = normalizeJobDefinitions(JOB_DEFINITIONS);

// ==========================================
// REWARD TABLES
// ==========================================

/**
 * Balanced reward tables with tiered progression
 * Common items: 1-5 | Uncommon: 6-20 | Rare: 21-100 | Epic: 101-500 | Legendary: 500+
 */
const REWARDS = {
    BLOCKS: {
        // Stone tier (Common)
        "minecraft:stone": 2, "minecraft:cobblestone": 2, "minecraft:mossy_cobblestone": 3,
        "minecraft:andesite": 2, "minecraft:diorite": 2, "minecraft:granite": 2,
        "minecraft:deepslate": 3, "minecraft:cobbled_deepslate": 3, "minecraft:tuff": 3, "minecraft:calcite": 3,
        
        // Ore tier (Uncommon to Epic)
        "minecraft:coal_ore": 6, "minecraft:deepslate_coal_ore": 8,
        "minecraft:copper_ore": 8, "minecraft:deepslate_copper_ore": 10,
        "minecraft:iron_ore": 12, "minecraft:deepslate_iron_ore": 15,
        "minecraft:gold_ore": 20, "minecraft:deepslate_gold_ore": 25,
        "minecraft:redstone_ore": 10, "minecraft:deepslate_redstone_ore": 12,
        "minecraft:lapis_ore": 15, "minecraft:deepslate_lapis_ore": 18,
        "minecraft:diamond_ore": 50, "minecraft:deepslate_diamond_ore": 65,
        "minecraft:emerald_ore": 60, "minecraft:deepslate_emerald_ore": 75,
        
        // Nether tier
        "minecraft:netherrack": 2, "minecraft:nether_quartz_ore": 12, "minecraft:nether_gold_ore": 15,
        "minecraft:ancient_debris": 200, "minecraft:blackstone": 3, "minecraft:gilded_blackstone": 35,
        "minecraft:basalt": 3, "minecraft:smooth_basalt": 4,
        
        // End tier
        "minecraft:end_stone": 4, "minecraft:purpur_block": 8,
        
        // Wood tier
        "minecraft:oak_log": 3, "minecraft:birch_log": 3, "minecraft:spruce_log": 3,
        "minecraft:jungle_log": 3, "minecraft:acacia_log": 3, "minecraft:dark_oak_log": 3,
        "minecraft:mangrove_log": 4, "minecraft:cherry_log": 4, "minecraft:pale_oak_log": 4,
        "minecraft:crimson_stem": 4, "minecraft:warped_stem": 4,
        
        // Building blocks
        "minecraft:bricks": 4, "minecraft:stone_bricks": 3, "minecraft:deepslate_bricks": 5,
        "minecraft:nether_bricks": 4, "minecraft:quartz_block": 8,
        "minecraft:amethyst_block": 25, "minecraft:budding_amethyst": 60,
        "minecraft:sculk": 10, "minecraft:sculk_catalyst": 30,
        "minecraft:sculk_sensor": 35, "minecraft:sculk_shrieker": 45,
        
        // Utility
        "minecraft:obsidian": 12, "minecraft:crying_obsidian": 18,
        "minecraft:glowstone": 6, "minecraft:sea_lantern": 10,
        "minecraft:copper_block": 15, "minecraft:exposed_copper": 12,
        "minecraft:weathered_copper": 18, "minecraft:oxidized_copper": 20
    },
    
    MOBS: {
        // Common Hostile
        "minecraft:zombie": 4, "minecraft:husk": 5, "minecraft:drowned": 6,
        "minecraft:skeleton": 4, "minecraft:stray": 5,
        "minecraft:creeper": 6, "minecraft:spider": 5, "minecraft:cave_spider": 8,
        "minecraft:slime": 4, "minecraft:phantom": 8,
        
        // Uncommon Hostile
        "minecraft:enderman": 12, "minecraft:witch": 15,
        "minecraft:silverfish": 3, "minecraft:endermite": 5,
        
        // Nether Hostile
        "minecraft:wither_skeleton": 25, "minecraft:blaze": 12, "minecraft:ghast": 20,
        "minecraft:zombified_piglin": 8, "minecraft:piglin": 10, "minecraft:piglin_brute": 35,
        "minecraft:hoglin": 12, "minecraft:zoglin": 15, "minecraft:magma_cube": 8,
        
        // Rare Hostile
        "minecraft:evoker": 80, "minecraft:vindicator": 40, "minecraft:pillager": 15,
        "minecraft:ravager": 50, "minecraft:vex": 15,
        "minecraft:guardian": 20, "minecraft:elder_guardian": 100,
        "minecraft:shulker": 30, "minecraft:warden": 400,
        
        // Bosses
        "minecraft:ender_dragon": 2000, "minecraft:wither": 1500,
        
        // Passive (low rewards)
        "minecraft:pig": 2, "minecraft:cow": 2, "minecraft:chicken": 1,
        "minecraft:sheep": 2, "minecraft:rabbit": 2,
        "minecraft:bee": 5, "minecraft:axolotl": 8, "minecraft:goat": 6,
        "minecraft:strider": 10, "minecraft:allay": 15
    },
    
    FARMING: {
        "minecraft:wheat": 3, "minecraft:carrots": 3, "minecraft:potatoes": 3,
        "minecraft:beetroot": 3, "minecraft:nether_wart": 6,
        "minecraft:melon_block": 5, "minecraft:pumpkin": 5,
        "minecraft:sugar_cane": 2, "minecraft:bamboo": 2,
        "minecraft:cactus": 3, "minecraft:kelp": 1,
        "minecraft:sweet_berry_bush": 4, "minecraft:cocoa": 4,
        "minecraft:red_mushroom": 3, "minecraft:brown_mushroom": 3,
        "minecraft:crimson_fungus": 5, "minecraft:warped_fungus": 5,
        "minecraft:chorus_plant": 8, "minecraft:chorus_flower": 10,
        "minecraft:glow_berries": 10, "minecraft:spore_blossom": 20,
        "minecraft:flowering_azalea": 12, "minecraft:moss_block": 5,
        "minecraft:big_dripleaf": 8, "minecraft:small_dripleaf": 4
    },
    
    CRAFTING: {
        // Tools (Wood -> Netherite)
        "minecraft:wooden_pickaxe": 2, "minecraft:wooden_axe": 2, "minecraft:wooden_shovel": 2, "minecraft:wooden_hoe": 2, "minecraft:wooden_sword": 2,
        "minecraft:stone_pickaxe": 5, "minecraft:stone_axe": 5, "minecraft:stone_shovel": 5, "minecraft:stone_hoe": 5, "minecraft:stone_sword": 5,
        "minecraft:iron_pickaxe": 15, "minecraft:iron_axe": 15, "minecraft:iron_shovel": 15, "minecraft:iron_hoe": 15, "minecraft:iron_sword": 15,
        "minecraft:diamond_pickaxe": 50, "minecraft:diamond_axe": 50, "minecraft:diamond_shovel": 50, "minecraft:diamond_hoe": 50, "minecraft:diamond_sword": 50,
        "minecraft:netherite_pickaxe": 250, "minecraft:netherite_axe": 250, "minecraft:netherite_shovel": 250, "minecraft:netherite_hoe": 250, "minecraft:netherite_sword": 250,
        
        // Armor
        "minecraft:leather_helmet": 6, "minecraft:leather_chestplate": 10, "minecraft:leather_leggings": 8, "minecraft:leather_boots": 5,
        "minecraft:iron_helmet": 20, "minecraft:iron_chestplate": 35, "minecraft:iron_leggings": 30, "minecraft:iron_boots": 15,
        "minecraft:diamond_helmet": 80, "minecraft:diamond_chestplate": 130, "minecraft:diamond_leggings": 110, "minecraft:diamond_boots": 60,
        "minecraft:netherite_helmet": 400, "minecraft:netherite_chestplate": 650, "minecraft:netherite_leggings": 550, "minecraft:netherite_boots": 300,
        
        // Utility blocks
        "minecraft:crafting_table": 2, "minecraft:chest": 4, "minecraft:barrel": 6,
        "minecraft:furnace": 5, "minecraft:blast_furnace": 10, "minecraft:smoker": 10,
        "minecraft:hopper": 25, "minecraft:dispenser": 20, "minecraft:dropper": 15,
        "minecraft:piston": 12, "minecraft:sticky_piston": 20,
        "minecraft:observer": 15, "minecraft:repeater": 8, "minecraft:comparator": 12,
        "minecraft:enchanting_table": 150, "minecraft:anvil": 60, "minecraft:grindstone": 20,
        "minecraft:beacon": 800, "minecraft:end_crystal": 200,
        "minecraft:conduit": 250, "minecraft:lodestone": 100,
        
        // Redstone
        "minecraft:redstone_block": 35, "minecraft:daylight_detector": 15,
        "minecraft:target": 12, "minecraft:lightning_rod": 18
    },
    
    FISHING: {
        "minecraft:cod": 5, "minecraft:salmon": 6, "minecraft:tropical_fish": 10, "minecraft:pufferfish": 15,
        "minecraft:bow": 25, "minecraft:fishing_rod": 8, "minecraft:name_tag": 40,
        "minecraft:saddle": 50, "minecraft:nautilus_shell": 30, "minecraft:heart_of_the_sea": 150,
        "minecraft:enchanted_book": 60
    },
    
    EXPLORATION: {
        "village": 60, "mineshaft": 40, "fortress": 100, "stronghold": 150,
        "monument": 150, "mansion": 200, "ruined_portal": 50,
        "shipwreck": 45, "temple": 60, "outpost": 70,
        "city": 250, "trail_ruins": 80, "ancient_city": 400,
        "buried_treasure": 100, "dungeons": 30,
        "rare_biome": 30, "nether_biome": 40, "end_biome": 60, "deep_dark": 120
    },
    
    TRADING: {
        "common_trade": 6, "rare_trade": 20, "epic_trade": 45, "legendary_trade": 100,
        "enchanted_book": 60, "name_tag": 25, "saddle": 35, "music_disc": 50
    }
};

// ==========================================
// QUESTS SYSTEM
// ==========================================

/**
 * Daily quests with proper categorization and balanced rewards
 */
const QUESTS = {
    miner: [
        { id: "mine_stone", name: "Stone Mason", target: 64, reward: 150, type: "block", items: ["minecraft:stone", "minecraft:cobblestone", "minecraft:deepslate"] },
        { id: "mine_coal", name: "Fuel Collector", target: 16, reward: 200, type: "block", items: ["minecraft:coal_ore", "minecraft:deepslate_coal_ore"] },
        { id: "mine_iron", name: "Iron Worker", target: 8, reward: 300, type: "block", items: ["minecraft:iron_ore", "minecraft:deepslate_iron_ore"] },
        { id: "mine_diamond", name: "Diamond Hunter", target: 3, reward: 800, type: "block", items: ["minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"] },
        { id: "mine_ancient_debris", name: "Nether Excavator", target: 2, reward: 1000, type: "block", items: ["minecraft:ancient_debris"] }
    ],
    hunter: [
        { id: "kill_zombies", name: "Zombie Slayer", target: 15, reward: 200, type: "mob", mobs: ["minecraft:zombie", "minecraft:husk", "minecraft:drowned"] },
        { id: "kill_skeletons", name: "Bone Collector", target: 10, reward: 180, type: "mob", mobs: ["minecraft:skeleton", "minecraft:stray"] },
        { id: "kill_creepers", name: "Creeper Hunter", target: 5, reward: 150, type: "mob", mobs: ["minecraft:creeper"] },
        { id: "kill_boss", name: "Boss Slayer", target: 1, reward: 1500, type: "boss", mobs: ["minecraft:ender_dragon", "minecraft:wither"] },
        { id: "kill_warden", name: "Deep Dark Terror", target: 1, reward: 2000, type: "mob", mobs: ["minecraft:warden"] }
    ],
    farmer: [
        { id: "harvest_wheat", name: "Wheat Farmer", target: 32, reward: 120, type: "crop", items: ["minecraft:wheat"] },
        { id: "harvest_mixed", name: "Diverse Harvest", target: 48, reward: 150, type: "crop", items: ["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot"] },
        { id: "harvest_melons", name: "Melon Farmer", target: 8, reward: 100, type: "crop", items: ["minecraft:melon_block", "minecraft:pumpkin"] },
        { id: "breed_animals", name: "Animal Breeder", target: 5, reward: 150, type: "breed" }
    ],
    fisherman: [
        { id: "catch_fish", name: "Daily Catch", target: 10, reward: 150, type: "fish", items: ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"] },
        { id: "catch_treasure", name: "Treasure Hunter", target: 3, reward: 400, type: "treasure", items: ["minecraft:enchanted_book", "minecraft:name_tag", "minecraft:saddle", "minecraft:nautilus_shell"] },
        { id: "catch_nautilus", name: "Shell Collector", target: 2, reward: 300, type: "treasure", items: ["minecraft:nautilus_shell"] }
    ],
    merchant: [
        { id: "trade_common", name: "Novice Trader", target: 10, reward: 200, type: "trade", tier: "common" },
        { id: "trade_rare", name: "Expert Trader", target: 5, reward: 500, type: "trade", tier: "rare" },
        { id: "spend_emeralds", name: "Big Spender", target: 50, reward: 400, type: "spend" }
    ],
    crafter: [
        { id: "craft_tools", name: "Tool Maker", target: 5, reward: 150, type: "craft", category: "tools" },
        { id: "craft_redstone", name: "Redstone Tinkerer", target: 10, reward: 300, type: "craft", category: "redstone" }
    ],
    blacksmith: [
        { id: "smith_ingots", name: "Ore Smelter", target: 16, reward: 220, type: "craft", category: "smithing" },
        { id: "forge_armor", name: "Armorer", target: 4, reward: 360, type: "craft", category: "armor" }
    ],
    alchemist: [
        { id: "brew_potions", name: "Potion Brewer", target: 8, reward: 240, type: "craft", category: "alchemy" },
        { id: "brew_splash", name: "Splash Specialist", target: 4, reward: 320, type: "craft", category: "splash" }
    ],
    lumberjack: [
        { id: "chop_logs", name: "Woodcutter", target: 32, reward: 120, type: "block", items: ["minecraft:oak_log", "minecraft:birch_log", "minecraft:spruce_log", "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log", "minecraft:mangrove_log", "minecraft:cherry_log", "minecraft:pale_oak_log", "minecraft:crimson_stem", "minecraft:warped_stem"] }
    ]
};

// ==========================================
// ACHIEVEMENTS
// ==========================================

const ACHIEVEMENTS = {
    FIRST_JOB: { id: "first_job", name: "First Step", description: "Join your first job", reward: 100 },
    JACK_OF_ALL_TRADES: { id: "jack_of_all", name: "Jack of All Trades", description: "Join all 12 available jobs", reward: 2000 },
    MILLIONAIRE: { id: "millionaire", name: "Millionaire", description: "Earn 1,000,000 total money", reward: 5000 },
    MAX_LEVEL: { id: "max_level", name: "Master Professional", description: "Reach level 100 in any job", reward: 3000 },
    QUEST_MASTER: { id: "quest_master", name: "Quest Master", description: "Complete 100 quests", reward: 2500 },
    UPGRADE_EXPERT: { id: "upgrade_expert", name: "Upgrade Expert", description: "Unlock 20 job upgrades", reward: 2000 },
    BLOCK_BREAKER: { id: "block_breaker", name: "Demolition Expert", description: "Break 10,000 blocks", reward: 1500 },
    MOB_SLAYER: { id: "mob_slayer", name: "Monster Hunter", description: "Kill 1,000 mobs", reward: 2000 },
    MASTER_BUILDER: { id: "master_builder", name: "Architect", description: "Place 5,000 blocks", reward: 1500 }
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Validates if a string is a valid Minecraft resource identifier
 * @param {string} id 
 * @returns {boolean}
 */
function isValidResourceId(id) {
    return typeof id === 'string' && id.includes(':') && id.split(':').length === 2;
}

/**
 * Deep clones an object (safe for serialization)
 * @param {any} obj 
 * @returns {any}
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof Object) {
        const cloned = {};
        Object.keys(obj).forEach(key => {
            cloned[key] = deepClone(obj[key]);
        });
        return cloned;
    }
    return obj;
}

/**
 * Safely parses JSON with fallback
 * @param {any} input 
 * @param {any} fallback 
 * @returns {any}
 */
function safeJsonParse(input, fallback = null) {
    if (typeof input !== 'string') return fallback;
    try {
        return JSON.parse(input);
    } catch {
        return fallback;
    }
}

/**
 * Formats a number with commas
 * @param {number} num 
 * @returns {string}
 */
function formatNumber(num) {
    return num.toLocaleString();
}

/**
 * Creates a visual progress bar
 * @param {number} current
 * @param {number} max
 * @param {number} length
 * @returns {string}
 */
function createProgressBar(current, max, length = 20) {
    const safeMax = Math.max(1, max || 1);
    const percentage = Math.min(100, Math.max(0, (current / safeMax) * 100));
    const filled = Math.floor((percentage / 100) * length);
    const empty = length - filled;
    return `§a${'█'.repeat(filled)}§8${'░'.repeat(empty)} §7${percentage.toFixed(1)}%`;
}

function createCompactProgressBar(current, max, length = 10) {
    const safeMax = Math.max(1, max || 1);
    const ratio = Math.min(1, Math.max(0, current / safeMax));
    const filled = Math.round(ratio * length);
    const empty = length - filled;
    return `§a${'█'.repeat(filled)}§8${'░'.repeat(empty)}`;
}

/**
 * Checks if a block type is a building block
 * @param {string} type
 * @returns {boolean}
 */
function isBuildingBlock(type) {
    const buildingKeywords = ['brick', 'stone', 'planks', 'concrete', 'terracotta', 'glass', 'wool', 'wood'];
    return buildingKeywords.some(keyword => type.includes(keyword));
}

/**
 * Calculates XP required for a level using exponential curve
 * @param {number} level
 * @returns {number}
 */
function getXPForLevel(level) {
    if (level <= 1) return 0;
    return Math.floor(100 * Math.pow(level, 1.4));
}


function getItemAmount(stack) {
    return stack?.amount ?? 0;
}

function getInventoryChanges(beforeStack, afterStack) {
    const changes = [];
    const beforeType = beforeStack?.typeId;
    const afterType = afterStack?.typeId;
    const beforeAmount = getItemAmount(beforeStack);
    const afterAmount = getItemAmount(afterStack);

    if (!beforeType && !afterType) return changes;

    if (beforeType && afterType && beforeType === afterType) {
        const delta = afterAmount - beforeAmount;
        if (delta !== 0) changes.push({ typeId: afterType, delta });
        return changes;
    }

    if (beforeType && beforeAmount > 0) {
        changes.push({ typeId: beforeType, delta: -beforeAmount });
    }
    if (afterType && afterAmount > 0) {
        changes.push({ typeId: afterType, delta: afterAmount });
    }

    return changes;
}

function isToolItem(typeId) {
    return ["pickaxe", "axe", "shovel", "hoe", "sword"].some(token => typeId.includes(token));
}

function isArmorItem(typeId) {
    return ["helmet", "chestplate", "leggings", "boots"].some(token => typeId.includes(token));
}

function isRedstoneItem(typeId) {
    return ["redstone", "repeater", "comparator", "observer", "piston", "hopper", "dispenser", "dropper"].some(token => typeId.includes(token));
}

function isPotionItem(typeId) {
    return ["minecraft:potion", "minecraft:splash_potion", "minecraft:lingering_potion"].includes(typeId);
}

function getCraftQuestCategory(typeId) {
    if (isToolItem(typeId)) return "tools";
    if (isRedstoneItem(typeId)) return "redstone";
    return "general";
}

function getBlacksmithReward(typeId) {
    const specific = {
        "minecraft:iron_ingot": 10,
        "minecraft:gold_ingot": 14,
        "minecraft:copper_ingot": 8,
        "minecraft:netherite_ingot": 120,
        "minecraft:chainmail_helmet": 20,
        "minecraft:chainmail_chestplate": 35,
        "minecraft:chainmail_leggings": 30,
        "minecraft:chainmail_boots": 18
    };
    if (specific[typeId]) return specific[typeId];
    if (isArmorItem(typeId)) return Math.max(8, Math.floor((REWARDS.CRAFTING[typeId] || 20) * 0.75));
    if (isToolItem(typeId)) return Math.max(6, Math.floor((REWARDS.CRAFTING[typeId] || 12) * 0.6));
    return 0;
}

function getBlacksmithQuestCategory(typeId) {
    if (typeId.includes("ingot")) return "smithing";
    if (isArmorItem(typeId)) return "armor";
    return "smithing";
}

function getAlchemyReward(typeId) {
    if (typeId === "minecraft:potion") return 18;
    if (typeId === "minecraft:splash_potion") return 24;
    if (typeId === "minecraft:lingering_potion") return 32;
    return 0;
}

function getAlchemyQuestCategory(typeId) {
    if (typeId === "minecraft:splash_potion") return "splash";
    return "alchemy";
}

function getTradeTierBySpend(spendAmount) {
    if (spendAmount >= 32) return "legendary";
    if (spendAmount >= 16) return "epic";
    if (spendAmount >= 8) return "rare";
    return "common";
}

function isTraderEntity(typeId) {
    return typeId === "minecraft:villager" || typeId === "minecraft:wandering_trader";
}

function getUpgradeCost(upgrade) {
    return Math.max(100, upgrade.level * CONFIG.UPGRADE_COST_PER_LEVEL);
}

// ==========================================
// DATA MANAGER
// ==========================================

/**
 * Manages all player data with validation, migration, and persistence
 * Uses optimized data structures for memory efficiency
 */
class DataManager {
    constructor() {
        this.playerData = new Map();
        this.cooldowns = new Map();
        this.jobLimits = new Map();
        this.questProgress = new Map();
        this.completedQuests = new Map();
        this.achievements = new Map();
        this.sessionStats = new Map();
        this.dirtyPlayers = new Set();
        this.offlinePlayers = new Map();
        this.autoSaveRunId = undefined;
        this.cleanupRunId = undefined;
        this.questResetRunId = undefined;
        this.limitRegenRunId = undefined;
        this.lastCleanup = system.currentTick;

        this.init();
    }

    init() {
        this.setupObjectives();

        this.syncPeriodicTasks();

        world.afterEvents.playerJoin?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            system.runTimeout(() => {
                const player = world.getAllPlayers().find(p => p.id === e.playerId);
                if (player) {
                    const retainedData = this.offlinePlayers.has(e.playerId)
                        ? this.playerData.get(e.playerId)
                        : null;
                    this.offlinePlayers.delete(e.playerId);
                    if (retainedData) {
                        this.saveDataToStorage(player, retainedData);
                    } else {
                        this.loadPlayerData(player);
                    }
                    this.cancelCleanupIfIdle();
                }
            }, 5);
        });

        world.afterEvents.playerLeave?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            this.offlinePlayers.set(e.playerId, system.currentTick);
            this.scheduleCleanup();
        });
    }

    setupObjectives() {
        system.run(() => {
            try {
                const objective = ensureScoreObjective(getActiveCurrencyObjectiveId(), `§6${getCurrencyDisplayName()}`);
                if (!objective) return;

                if (CONFIG.ENABLE_LEADERBOARD) {
                    world.scoreboard.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, {
                        objective,
                        sortOrder: 0
                    });
                }
            } catch (error) {
                console.error('[Jobs] Failed to setup scoreboard:', error);
            }
        });
    }

    markDirty(playerOrId) {
        const playerId = typeof playerOrId === 'string' ? playerOrId : playerOrId?.id;
        if (!playerId) return;
        this.dirtyPlayers.add(playerId);
        this.scheduleAutoSave();
    }

    clearDirty(playerOrId) {
        const playerId = typeof playerOrId === 'string' ? playerOrId : playerOrId?.id;
        if (playerId) this.dirtyPlayers.delete(playerId);
        if (this.dirtyPlayers.size === 0 && this.autoSaveRunId !== undefined) {
            system.clearRun(this.autoSaveRunId);
            this.autoSaveRunId = undefined;
        }
    }

    hasActiveJobs() {
        for (const player of world.getAllPlayers()) {
            const data = this.playerData.get(player.id);
            if (data?.jobs?.size > 0) return true;
        }
        return false;
    }

    getPlayerData(player) {
        if (!player?.id) return null;
        if (!this.playerData.has(player.id)) {
            this.loadPlayerData(player);
        }
        return this.playerData.get(player.id) || null;
    }

    loadPlayerData(player) {
        try {
            const rawData = player.getDynamicProperty('jobs_data_v2');
            let data = this.createDefaultData();

            if (rawData) {
                const parsed = safeJsonParse(rawData);
                if (parsed && typeof parsed === 'object') {
                    data = this.migrateData(parsed);
                }
            }

            const questData = player.getDynamicProperty('jobs_quests_v2');
            if (questData) {
                const parsed = safeJsonParse(questData);
                if (parsed) {
                    this.questProgress.set(player.id, new Map(Object.entries(parsed.progress || {})));
                    this.completedQuests.set(player.id, new Set(parsed.completed || []));
                }
            } else {
                this.questProgress.set(player.id, new Map());
                this.completedQuests.set(player.id, new Set());
            }

            const achData = player.getDynamicProperty('jobs_achievements_v2');
            if (achData) {
                this.achievements.set(player.id, new Set(safeJsonParse(achData, [])));
            } else {
                this.achievements.set(player.id, new Set());
            }

            const limitData = player.getDynamicProperty('jobs_limits_v2');
            if (limitData) {
                const parsed = safeJsonParse(limitData, {});
                this.jobLimits.set(player.id, {
                    current: new Map(Object.entries(parsed.current || {})),
                    max: new Map(Object.entries(parsed.max || {})),
                    lastRegen: parsed.lastRegen || system.currentTick
                });
            } else {
                this.jobLimits.set(player.id, {
                    current: new Map(),
                    max: new Map(),
                    lastRegen: system.currentTick
                });
            }

            this.sessionStats.set(player.id, {
                blocksBroken: 0,
                blocksPlaced: 0,
                mobsKilled: 0,
                startTime: Date.now()
            });

            data.settings = { notifications: normalizeNotificationSettings(data.settings?.notifications || {}) };
            data.history = normalizeHistoryEntries(data.history || []).slice(0, CONFIG.HISTORY_MAX_ENTRIES);
            this.playerData.set(player.id, data);
            this.clearDirty(player.id);

            if (CONFIG.DEBUG_MODE) {
                console.log(`[Jobs] Loaded data for ${player.name}`);
            }
        } catch (error) {
            console.error(`[Jobs] Failed to load data for ${player.name}:`, error);
            this.playerData.set(player.id, this.createDefaultData());
            this.questProgress.set(player.id, new Map());
            this.completedQuests.set(player.id, new Set());
            this.achievements.set(player.id, new Set());
            this.jobLimits.set(player.id, {
                current: new Map(),
                max: new Map(),
                lastRegen: system.currentTick
            });
        }
    }

    createDefaultData() {
        return {
            jobs: new Set(),
            historicalJobs: new Set(),
            joinTime: new Map(),
            earnings: new Map(),
            level: new Map(),
            xp: new Map(),
            unlockedUpgrades: new Map(),
            explorerCooldowns: new Map(),
            totalEarnings: 0,
            totalQuests: 0,
            lifetimeBlocksBroken: 0,
            lifetimeBlocksPlaced: 0,
            lifetimeMobsKilled: 0,
            lastSalary: 0,
            settings: { notifications: getDefaultNotificationSettings() },
            history: [],
            version: 4
        };
    }

    migrateData(oldData) {
        const newData = this.createDefaultData();

        if (oldData.jobs) newData.jobs = new Set(Array.isArray(oldData.jobs) ? oldData.jobs : Object.keys(oldData.jobs));
        if (oldData.historicalJobs) newData.historicalJobs = new Set(Array.isArray(oldData.historicalJobs) ? oldData.historicalJobs : Object.keys(oldData.historicalJobs));
        else newData.historicalJobs = new Set(newData.jobs);
        if (oldData.joinTime) newData.joinTime = new Map(Object.entries(oldData.joinTime));
        if (oldData.earnings) newData.earnings = new Map(Object.entries(oldData.earnings));
        if (oldData.level) newData.level = new Map(Object.entries(oldData.level));
        if (oldData.xp) newData.xp = new Map(Object.entries(oldData.xp));
        if (oldData.unlockedUpgrades) newData.unlockedUpgrades = new Map(Object.entries(oldData.unlockedUpgrades));
        if (oldData.explorerCooldowns) newData.explorerCooldowns = new Map(Object.entries(oldData.explorerCooldowns));
        newData.totalEarnings = oldData.totalEarnings || 0;
        newData.totalQuests = oldData.totalQuests || 0;
        newData.lifetimeBlocksBroken = oldData.lifetimeBlocksBroken || 0;
        newData.lifetimeBlocksPlaced = oldData.lifetimeBlocksPlaced || 0;
        newData.lifetimeMobsKilled = oldData.lifetimeMobsKilled || 0;
        newData.lastSalary = oldData.lastSalary || 0;
        newData.settings = { notifications: normalizeNotificationSettings(oldData.settings?.notifications || oldData.notifications || {}) };
        newData.history = normalizeHistoryEntries(oldData.history || []);
        newData.version = 4;
        return newData;
    }

    saveDataToStorage(playerOrId, dataOverride = null) {
        try {
            const playerId = typeof playerOrId === 'string' ? playerOrId : playerOrId?.id;
            const player = typeof playerOrId === 'string' ? world.getAllPlayers().find(p => p.id === playerOrId) : playerOrId;
            if (!playerId || !player) return false;

            const data = dataOverride || this.playerData.get(playerId);
            if (!data) return false;

            const saveData = {
                jobs: Array.from(data.jobs),
                historicalJobs: Array.from(data.historicalJobs || []),
                joinTime: Object.fromEntries(data.joinTime),
                earnings: Object.fromEntries(data.earnings),
                level: Object.fromEntries(data.level),
                xp: Object.fromEntries(data.xp),
                unlockedUpgrades: Object.fromEntries(data.unlockedUpgrades),
                explorerCooldowns: Object.fromEntries(data.explorerCooldowns || new Map()),
                totalEarnings: data.totalEarnings,
                totalQuests: data.totalQuests,
                lifetimeBlocksBroken: data.lifetimeBlocksBroken || 0,
                lifetimeBlocksPlaced: data.lifetimeBlocksPlaced || 0,
                lifetimeMobsKilled: data.lifetimeMobsKilled || 0,
                lastSalary: data.lastSalary || 0,
                settings: { notifications: normalizeNotificationSettings(data.settings?.notifications || {}) },
                history: normalizeHistoryEntries(data.history || []).slice(0, CONFIG.HISTORY_MAX_ENTRIES),
                version: 4
            };

            player.setDynamicProperty('jobs_data_v2', JSON.stringify(saveData));

            const questProgress = this.questProgress.get(playerId);
            const completed = this.completedQuests.get(playerId);
            if (questProgress && completed) {
                player.setDynamicProperty('jobs_quests_v2', JSON.stringify({
                    progress: Object.fromEntries(questProgress),
                    completed: Array.from(completed)
                }));
            }

            const achievements = this.achievements.get(playerId);
            if (achievements) {
                player.setDynamicProperty('jobs_achievements_v2', JSON.stringify(Array.from(achievements)));
            }

            const limits = this.jobLimits.get(playerId);
            if (limits) {
                player.setDynamicProperty('jobs_limits_v2', JSON.stringify({
                    current: Object.fromEntries(limits.current),
                    max: Object.fromEntries(limits.max),
                    lastRegen: limits.lastRegen
                }));
            }

            this.clearDirty(playerId);
            return true;
        } catch (error) {
            console.error('[Jobs] Failed to save data:', error);
            return false;
        }
    }

    saveAllData(force = false) {
        if (!force && this.dirtyPlayers.size === 0) return;
        const onlinePlayers = world.getAllPlayers();
        const playerMap = new Map(onlinePlayers.map(player => [player.id, player]));

        if (force) {
            for (const player of onlinePlayers) {
                this.saveDataToStorage(player);
            }
            return;
        }

        const batchSize = 3;
        let count = 0;
        for (const playerId of [...this.dirtyPlayers]) {
            const player = playerMap.get(playerId);
            if (player) {
                this.saveDataToStorage(player);
                count++;
                if (count >= batchSize) break;
            } else {
                this.dirtyPlayers.delete(playerId);
            }
        }
        if (this.dirtyPlayers.size > 0) this.scheduleAutoSave();
    }

    scheduleAutoSave() {
        if (this.autoSaveRunId !== undefined || this.dirtyPlayers.size === 0) return;
        this.autoSaveRunId = system.runTimeout(() => {
            this.autoSaveRunId = undefined;
            this.saveAllData(false);
        }, CONFIG.SAVE_INTERVAL_TICKS);
    }

    scheduleCleanup() {
        if (this.cleanupRunId !== undefined || (this.offlinePlayers.size === 0 && this.cooldowns.size === 0)) return;
        this.cleanupRunId = system.runTimeout(() => {
            this.cleanupRunId = undefined;
            this.cleanup();
            this.scheduleCleanup();
        }, CONFIG.CLEANUP_INTERVAL);
    }

    cancelCleanupIfIdle() {
        if (this.offlinePlayers.size > 0 || this.cooldowns.size > 0 || this.cleanupRunId === undefined) return;
        system.clearRun(this.cleanupRunId);
        this.cleanupRunId = undefined;
    }

    cleanup() {
        if (this.offlinePlayers.size === 0 && this.cooldowns.size === 0) return;
        const currentTick = system.currentTick;
        const onlineIds = this.offlinePlayers.size > 0
            ? new Set(world.getAllPlayers().map(p => p.id))
            : null;

        for (const [playerId, leftAtTick] of this.offlinePlayers) {
            if (!onlineIds?.has(playerId) && currentTick - leftAtTick >= CONFIG.CLEANUP_INTERVAL) {
                this.playerData.delete(playerId);
                this.questProgress.delete(playerId);
                this.completedQuests.delete(playerId);
                this.achievements.delete(playerId);
                this.jobLimits.delete(playerId);
                this.sessionStats.delete(playerId);
                this.offlinePlayers.delete(playerId);
                this.clearDirty(playerId);
            }
        }

        for (const [key, expiryTick] of this.cooldowns) {
            if (currentTick >= expiryTick) this.cooldowns.delete(key);
        }

        this.lastCleanup = currentTick;
    }

    syncPeriodicTasks() {
        if (!isJobsSystemEnabled()) {
            this.stopQuestReset();
            this.stopLimitRegeneration();
            return;
        }
        if (CONFIG.ENABLE_QUESTS) this.startQuestReset();
        else this.stopQuestReset();
        if (CONFIG.JOB_LIMIT_ENABLED) this.startLimitRegeneration();
        else this.stopLimitRegeneration();
    }

    stopQuestReset() {
        if (this.questResetRunId === undefined) return;
        system.clearRun(this.questResetRunId);
        this.questResetRunId = undefined;
    }

    stopLimitRegeneration() {
        if (this.limitRegenRunId === undefined) return;
        system.clearRun(this.limitRegenRunId);
        this.limitRegenRunId = undefined;
    }

    startQuestReset() {
        if (this.questResetRunId !== undefined) return;
        this.questResetRunId = system.runInterval(() => {
            if (!isJobsSystemEnabled()) {
                this.syncPeriodicTasks();
                return;
            }
            if (!this.hasActiveJobs()) return;
            for (const player of world.getAllPlayers()) {
                this.questProgress.set(player.id, new Map());
                this.completedQuests.set(player.id, new Set());
                this.markDirty(player.id);
                if (this.shouldNotify(player, 'systemTips')) player.sendMessage(t(player, 'quests.new'));
                playJobSound(player, 'quest');
            }
            this.saveAllData(true);
        }, CONFIG.QUEST_RESET_TICKS);
    }

    startLimitRegeneration() {
        if (this.limitRegenRunId !== undefined) return;
        this.limitRegenRunId = system.runInterval(() => {
            if (!isJobsSystemEnabled()) {
                this.syncPeriodicTasks();
                return;
            }
            if (!this.hasActiveJobs()) return;
            const currentTick = system.currentTick;
            for (const player of world.getAllPlayers()) {
                const limits = this.jobLimits.get(player.id);
                const data = this.playerData.get(player.id);
                if (!limits || !data) continue;

                let changed = false;
                for (const jobId of data.jobs) {
                    const current = limits.current.get(jobId) || 0;
                    if (current > 0) {
                        limits.current.set(jobId, Math.max(0, current - CONFIG.LIMIT_REGEN_RATE));
                        changed = true;
                    }
                }
                limits.lastRegen = currentTick;
                if (changed) this.markDirty(player.id);
            }
        }, CONFIG.LIMIT_REGEN_INTERVAL);
    }

    canJoinJob(player, jobId) {
        const data = this.getPlayerData(player);
        if (!data) return { canJoin: false, reason: 'System error' };
        if (data.jobs.has(jobId)) return { canJoin: false, reason: '§cYou already have this job!' };
        if (data.jobs.size >= CONFIG.MAX_JOBS) return { canJoin: false, reason: `§cMaximum ${CONFIG.MAX_JOBS} jobs reached!` };

        const cooldownKey = `${player.id}_${jobId}`;
        if (this.cooldowns.has(cooldownKey)) {
            const remaining = this.cooldowns.get(cooldownKey) - system.currentTick;
            if (remaining > 0) {
                return { canJoin: false, reason: `§cCooldown: ${Math.ceil(remaining / 1200)} minutes remaining` };
            }
            this.cooldowns.delete(cooldownKey);
        }

        return { canJoin: true, reason: '' };
    }

    joinJob(player, jobId) {
        const check = this.canJoinJob(player, jobId);
        if (!check.canJoin) throw new Error(check.reason);

        const data = this.getPlayerData(player);
        data.jobs.add(jobId);
        data.historicalJobs.add(jobId);
        data.joinTime.set(jobId, Date.now());
        data.earnings.set(jobId, data.earnings.get(jobId) || 0);
        data.level.set(jobId, data.level.get(jobId) || 1);
        data.xp.set(jobId, data.xp.get(jobId) || 0);
        data.unlockedUpgrades.set(jobId, data.unlockedUpgrades.get(jobId) || []);

        if (data.jobs.size === 1) {
            this.unlockAchievement(player, ACHIEVEMENTS.FIRST_JOB);
        }
        if (data.historicalJobs.size === Object.keys(JOBS).length) {
            this.unlockAchievement(player, ACHIEVEMENTS.JACK_OF_ALL_TRADES);
        }

        this.markDirty(player.id);
        this.saveDataToStorage(player, data);
        return true;
    }

    leaveJob(player, jobId) {
        const data = this.getPlayerData(player);
        if (!data?.jobs.has(jobId)) throw new Error("§cYou don't have this job!");

        data.jobs.delete(jobId);
        data.joinTime.delete(jobId);
        data.earnings.delete(jobId);
        data.level.delete(jobId);
        data.xp.delete(jobId);
        data.unlockedUpgrades.delete(jobId);
        this.cooldowns.set(`${player.id}_${jobId}`, system.currentTick + CONFIG.COOLDOWN_TICKS);
        this.scheduleCleanup();

        this.markDirty(player.id);
        this.saveDataToStorage(player, data);
        return true;
    }

    canPerformJobAction(player, jobId) {
        if (!CONFIG.JOB_LIMIT_ENABLED) return { canPerform: true, remaining: 9999 };

        const limits = this.jobLimits.get(player.id);
        const data = this.playerData.get(player.id);
        if (!limits || !data) return { canPerform: false, remaining: 0 };

        const current = limits.current.get(jobId) || 0;
        const level = data.level.get(jobId) || 1;
        const max = CONFIG.BASE_JOB_LIMIT + (level * 3);
        limits.max.set(jobId, max);

        if (current >= max) return { canPerform: false, remaining: 0 };
        return { canPerform: true, remaining: max - current };
    }

    useJobLimit(player, jobId, amount = 1) {
        if (!CONFIG.JOB_LIMIT_ENABLED) return;
        const limits = this.jobLimits.get(player.id);
        if (!limits) return;
        limits.current.set(jobId, (limits.current.get(jobId) || 0) + amount);
        this.markDirty(player.id);
    }

    addReward(player, jobId, baseAmount, itemType = null) {
        const data = this.getPlayerData(player);
        if (!data?.jobs.has(jobId)) return { points: 0, payouts: [] };

        if (CONFIG.JOB_LIMIT_ENABLED) {
            const limitCheck = this.canPerformJobAction(player, jobId);
            if (!limitCheck.canPerform) {
                if (Math.random() < 0.1 && this.shouldNotify(player, 'systemTips')) {
                    player.sendMessage(t(player, 'limit.reached', { job: jobNameColored(player, jobId) }));
                    playJobSound(player, 'warning');
                }
                return { points: 0, payouts: [] };
            }
            this.useJobLimit(player, jobId);
        }

        let multiplier = 1;
        const level = data.level.get(jobId) || 1;
        const upgrades = data.unlockedUpgrades.get(jobId) || [];
        const job = JOBS[jobId.toUpperCase()];

        for (const upgradeName of upgrades) {
            const upgrade = job.upgrades.find(u => u.name === upgradeName);
            if (upgrade && upgrade.condition(itemType || '')) multiplier *= upgrade.multiplier;
        }

        const levelBonus = 1 + (level * CONFIG.LEVEL_BONUS_PERCENT / 100);
        const finalAmount = Math.max(1, Math.floor(baseAmount * levelBonus * multiplier));

        data.earnings.set(jobId, (data.earnings.get(jobId) || 0) + finalAmount);
        data.totalEarnings += finalAmount;
        this.markDirty(player.id);

        if (data.totalEarnings >= 1000000 && !this.hasAchievement(player, ACHIEVEMENTS.MILLIONAIRE)) {
            this.unlockAchievement(player, ACHIEVEMENTS.MILLIONAIRE);
        }

        this.addXP(player, jobId, Math.max(1, Math.floor(finalAmount / 5)));
        const payoutResult = applyConfiguredRewardPayouts(player, 'activity', {
            jobId,
            baseAmount,
            computedAmount: finalAmount,
            configuredAmount: finalAmount,
            itemType
        });
        if (payoutResult.points > 0 || payoutResult.payouts.length > 0) {
            this.addHistoryEntry(player, {
                type: 'reward',
                jobId,
                title: `${jobNamePlain(player, jobId)} Reward`,
                detail: formatRewardSummary(payoutResult) || `${formatNumber(finalAmount)} points`
            });
        }
        return payoutResult;
    }

    addXP(player, jobId, amount) {
        const data = this.getPlayerData(player);
        if (!data) return;

        const currentLevel = data.level.get(jobId) || 1;
        const currentXP = data.xp.get(jobId) || 0;
        const newXP = currentXP + amount;
        const xpNeeded = getXPForLevel(currentLevel + 1);

        if (newXP >= xpNeeded && currentLevel < CONFIG.MAX_LEVEL) {
            data.level.set(jobId, currentLevel + 1);
            data.xp.set(jobId, newXP - xpNeeded);
            this.addHistoryEntry(player, {
                type: 'levelup',
                jobId,
                title: `${jobNamePlain(player, jobId)} Level Up`,
                detail: `Reached level ${currentLevel + 1}`
            });
            if (this.shouldNotify(player, 'levelUpMessages')) {
                player.sendMessage(t(player, 'levelup', { job: jobNameColored(player, jobId), level: currentLevel + 1 }));
            }
            playJobSound(player, 'levelUp');
            if (currentLevel + 1 === CONFIG.MAX_LEVEL) {
                this.unlockAchievement(player, ACHIEVEMENTS.MAX_LEVEL);
            }
        } else {
            data.xp.set(jobId, newXP);
        }

        this.markDirty(player.id);
    }

    updateScoreboard(player, amount) {
        setScoreDelta(player, getActiveCurrencyObjectiveId(), amount);
    }

    getAvailableUpgrades(player, jobId) {
        const data = this.getPlayerData(player);
        if (!data) return [];
        const level = data.level.get(jobId) || 1;
        const unlocked = data.unlockedUpgrades.get(jobId) || [];
        const job = JOBS[jobId.toUpperCase()];
        if (!job) return [];
        return job.upgrades.filter(u => level >= u.level && !unlocked.includes(u.name));
    }

    unlockUpgrade(player, jobId, upgradeName) {
        const data = this.getPlayerData(player);
        if (!data) return { success: false, reason: 'Missing player data', cost: 0 };

        const upgrades = data.unlockedUpgrades.get(jobId) || [];
        if (upgrades.includes(upgradeName)) return { success: false, reason: 'Already unlocked', cost: 0 };

        const job = JOBS[jobId.toUpperCase()];
        const upgrade = job?.upgrades.find(entry => entry.name === upgradeName);
        if (!upgrade) return { success: false, reason: 'Unknown upgrade', cost: 0 };

        const cost = getUpgradeCost(upgrade);
        if (CONFIG.UPGRADE_COSTS_ENABLED) {
            const currentBalance = getCurrencyScore(player);
            if (currentBalance < cost) {
                return { success: false, reason: `You need ${formatCurrencyAmount(cost)} to unlock this upgrade.`, cost };
            }
            this.updateScoreboard(player, -cost);
        }

        upgrades.push(upgradeName);
        data.unlockedUpgrades.set(jobId, upgrades);

        const totalUpgrades = Array.from(data.unlockedUpgrades.values()).reduce((a, b) => a + b.length, 0);
        if (totalUpgrades >= 20 && !this.hasAchievement(player, ACHIEVEMENTS.UPGRADE_EXPERT)) {
            this.unlockAchievement(player, ACHIEVEMENTS.UPGRADE_EXPERT);
        }

        this.markDirty(player.id);
        this.saveDataToStorage(player, data);
        return { success: true, cost };
    }

    updateQuestProgress(player, jobId, type, itemType = null, amount = 1) {
        if (!CONFIG.ENABLE_QUESTS) return;

        const jobQuests = QUESTS[jobId] || [];
        if (jobQuests.length === 0) return;

        const progress = this.questProgress.get(player.id);
        const completed = this.completedQuests.get(player.id);
        if (!progress || !completed) return;

        for (const quest of jobQuests) {
            if (completed.has(quest.id)) continue;
            let shouldProgress = false;

            switch (quest.type) {
                case 'block':
                case 'crop':
                case 'fish':
                case 'treasure':
                    if (type === quest.type && quest.items?.some(item => itemType?.includes(item.replace('minecraft:', '')))) shouldProgress = true;
                    break;
                case 'mob':
                case 'boss':
                    if (type === quest.type && quest.mobs?.some(mob => itemType?.includes(mob.replace('minecraft:', '')))) shouldProgress = true;
                    break;
                case 'trade':
                    if (type === 'trade' && quest.tier === itemType) shouldProgress = true;
                    break;
                case 'craft':
                    if (type === 'craft' && quest.category === itemType) shouldProgress = true;
                    break;
                case 'breed':
                    if (type === 'breed') shouldProgress = true;
                    break;
                case 'spend':
                    if (type === 'spend') shouldProgress = true;
                    break;
            }

            if (!shouldProgress) continue;

            const current = progress.get(quest.id) || 0;
            const newProgress = current + amount;
            progress.set(quest.id, newProgress);
            this.markDirty(player.id);

            if (newProgress >= quest.target) {
                completed.add(quest.id);
                const data = this.getPlayerData(player);
                if (data) {
                    data.totalQuests++;
                    data.totalEarnings += quest.reward;
                    const payoutResult = applyConfiguredRewardPayouts(player, 'quest', {
                        jobId,
                        configuredAmount: quest.reward,
                        computedAmount: quest.reward,
                        questId: quest.id
                    });
                    if (data.totalQuests >= 100 && !this.hasAchievement(player, ACHIEVEMENTS.QUEST_MASTER)) {
                        this.unlockAchievement(player, ACHIEVEMENTS.QUEST_MASTER);
                    }
                    this.addHistoryEntry(player, {
                        type: 'quest',
                        jobId,
                        title: `${jobNamePlain(player, jobId)} Quest Complete`,
                        detail: `${quest.name} — ${formatRewardSummary(payoutResult) || `$${formatNumber(quest.reward)}`}`
                    });
                    this.markDirty(player.id);
                    this.saveDataToStorage(player, data);
                    if (this.shouldNotify(player, 'questMessages')) {
                        player.sendMessage(t(player, 'quests.complete', { quest: quest.name }));
                    }
                    if (this.shouldNotify(player, 'rewardChat')) {
                        for (const line of getRewardLines(payoutResult)) player.sendMessage(line);
                    }
                    playJobSound(player, 'quest');
                }
            }
        }
    }

    hasAchievement(player, achievement) {
        return this.achievements.get(player.id)?.has(achievement.id) || false;
    }

    unlockAchievement(player, achievement) {
        if (this.hasAchievement(player, achievement)) return;
        const ach = this.achievements.get(player.id);
        if (!ach) return;
        ach.add(achievement.id);

        const payoutResult = applyConfiguredRewardPayouts(player, 'achievement', {
            configuredAmount: achievement.reward,
            computedAmount: achievement.reward,
            achievementId: achievement.id
        });

        const data = this.getPlayerData(player);
        if (data) {
            data.totalEarnings += achievement.reward;
            this.addHistoryEntry(player, {
                type: 'achievement',
                title: `Achievement Unlocked`,
                detail: `${achievement.name} — ${formatRewardSummary(payoutResult) || `$${formatNumber(achievement.reward)}`}`
            });
            this.markDirty(player.id);
            this.saveDataToStorage(player, data);
        }

        if (this.shouldNotify(player, 'achievementMessages')) {
            player.sendMessage(t(player, 'achievement.unlocked', { achievement: achievement.name }));
            player.sendMessage(`§7${achievement.description}`);
        }
        if (this.shouldNotify(player, 'rewardChat')) {
            for (const line of getRewardLines(payoutResult)) player.sendMessage(line);
        }
        playJobSound(player, 'achievement');
    }

    updateSessionStats(player, statType, amount = 1) {
        const stats = this.sessionStats.get(player.id);
        const data = this.getPlayerData(player);
        if (!stats || !data) return;

        stats[statType] = (stats[statType] || 0) + amount;

        if (statType === 'blocksBroken') {
            data.lifetimeBlocksBroken = (data.lifetimeBlocksBroken || 0) + amount;
            if (data.lifetimeBlocksBroken >= 10000) this.unlockAchievement(player, ACHIEVEMENTS.BLOCK_BREAKER);
        }
        if (statType === 'mobsKilled') {
            data.lifetimeMobsKilled = (data.lifetimeMobsKilled || 0) + amount;
            if (data.lifetimeMobsKilled >= 1000) this.unlockAchievement(player, ACHIEVEMENTS.MOB_SLAYER);
        }
        if (statType === 'blocksPlaced') {
            data.lifetimeBlocksPlaced = (data.lifetimeBlocksPlaced || 0) + amount;
            if (data.lifetimeBlocksPlaced >= 5000) this.unlockAchievement(player, ACHIEVEMENTS.MASTER_BUILDER);
        }

        this.markDirty(player.id);
    }

    canRewardExplorer(player, dimensionId) {
        const data = this.getPlayerData(player);
        if (!data) return false;
        const cooldowns = data.explorerCooldowns || new Map();
        const now = Date.now();
        const lastReward = Number(cooldowns.get(dimensionId) || 0);
        if (now - lastReward < CONFIG.EXPLORER_DIMENSION_COOLDOWN_MS) return false;
        cooldowns.set(dimensionId, now);
        data.explorerCooldowns = cooldowns;
        this.markDirty(player.id);
        return true;
    }

    resetPlayerData(player) {
        const fresh = this.createDefaultData();
        this.playerData.set(player.id, fresh);
        this.questProgress.set(player.id, new Map());
        this.completedQuests.set(player.id, new Set());
        this.achievements.set(player.id, new Set());
        this.jobLimits.set(player.id, {
            current: new Map(),
            max: new Map(),
            lastRegen: system.currentTick
        });
        this.sessionStats.set(player.id, {
            blocksBroken: 0,
            blocksPlaced: 0,
            mobsKilled: 0,
            startTime: Date.now()
        });

        this.markDirty(player.id);
        this.saveDataToStorage(player, fresh);
    }

    getJobStats(player, jobId) {
        const data = this.getPlayerData(player);
        if (!data?.jobs.has(jobId)) return null;

        const job = JOBS[jobId.toUpperCase()];
        const level = data.level.get(jobId) || 1;
        const xp = data.xp.get(jobId) || 0;
        const earnings = data.earnings.get(jobId) || 0;
        const xpNeeded = getXPForLevel(level + 1);
        const unlockedUpgrades = data.unlockedUpgrades.get(jobId) || [];
        const limitInfo = this.canPerformJobAction(player, jobId);

        return {
            job,
            level,
            xp,
            xpNeeded,
            progress: xpNeeded > 0 ? (xp / xpNeeded) * 100 : 100,
            earnings,
            bonus: level * CONFIG.LEVEL_BONUS_PERCENT,
            unlockedUpgrades,
            limitInfo
        };
    }

    getNotificationSettings(player) {
        const data = this.getPlayerData(player);
        return normalizeNotificationSettings(data?.settings?.notifications || {});
    }

    shouldNotify(player, key) {
        return this.getNotificationSettings(player)[key] !== false;
    }

    updateNotificationSettings(player, nextSettings) {
        const data = this.getPlayerData(player);
        if (!data) return;
        data.settings = {
            notifications: normalizeNotificationSettings(nextSettings)
        };
        this.markDirty(player.id);
        this.saveDataToStorage(player, data);
    }

    addHistoryEntry(player, entry) {
        const data = this.getPlayerData(player);
        if (!data) return;
        const history = normalizeHistoryEntries(data.history || []);
        history.unshift({
            type: String(entry?.type || 'note'),
            title: String(entry?.title || 'Activity'),
            detail: String(entry?.detail || ''),
            jobId: entry?.jobId ? String(entry.jobId) : null,
            timestamp: Date.now()
        });
        data.history = history.slice(0, CONFIG.HISTORY_MAX_ENTRIES);
        this.markDirty(player.id);
    }

    clearHistory(player) {
        const data = this.getPlayerData(player);
        if (!data) return;
        data.history = [];
        this.markDirty(player.id);
        this.saveDataToStorage(player, data);
    }

    getHistory(player, limit = CONFIG.HISTORY_GUI_ENTRIES) {
        const data = this.getPlayerData(player);
        return normalizeHistoryEntries(data?.history || []).slice(0, limit);
    }

    getTopEarners(limit = 10) {
        const allPlayers = [];
        for (const player of world.getAllPlayers()) {
            const data = this.getPlayerData(player);
            if (data) {
                allPlayers.push({
                    name: player.name,
                    earnings: data.totalEarnings
                });
            }
        }
        return allPlayers.sort((a, b) => b.earnings - a.earnings).slice(0, limit);
    }

    getJobLeaderboard(jobId, metric = 'earnings', limit = 10) {
        const entries = [];
        for (const player of world.getAllPlayers()) {
            const data = this.getPlayerData(player);
            if (!data?.jobs.has(jobId)) continue;
            const value = metric === 'level'
                ? (data.level.get(jobId) || 1)
                : (data.earnings.get(jobId) || 0);
            entries.push({
                name: player.name,
                value,
                level: data.level.get(jobId) || 1,
                earnings: data.earnings.get(jobId) || 0
            });
        }
        return entries.sort((a, b) => {
            if (metric === 'level') {
                if (b.value !== a.value) return b.value - a.value;
                return b.earnings - a.earnings;
            }
            if (b.value !== a.value) return b.value - a.value;
            return b.level - a.level;
        }).slice(0, limit);
    }
}


// ==========================================
// GUI SYSTEM
// ==========================================

/**
 * Enhanced GUI with better navigation and user experience
 */
class JobGUI {
    constructor(dataManager) {
        this.data = dataManager;
    }
    
    async showMainMenu(player) {
        const data = this.data.getPlayerData(player);
        if (!data) {
            player.sendMessage(t(player, "error.data"));
            return;
        }

        const jobCount = data.jobs.size;
        const jobList = jobCount > 0 
            ? Array.from(data.jobs).map(j => jobNameColored(player, j).replace('§r', '')).join("§7, ")
            : "§cNone";

        const form = new ActionFormData()
            .title(t(player, "ui.main.title"))
            .body(
                `${t(player, "ui.main.welcome", { player: player.name })}\n\n` +
                `${t(player, "ui.main.active_jobs")}: §e${jobCount}§7/§e${CONFIG.MAX_JOBS}\n` +
                `${jobList}\n\n` +
                `${t(player, "ui.main.total_earnings")}: §a$${formatNumber(data.totalEarnings)}\n` +
                `${t(player, "ui.main.quests_completed")}: §b${data.totalQuests}\n` +
                `${t(player, "ui.main.achievements")}: §d${this.data.achievements.get(player.id)?.size || 0}§7/§d${Object.keys(ACHIEVEMENTS).length}`
            )
            .button(t(player, "btn.my_jobs"), "textures/items/book_written")
            .button(t(player, "btn.browse_jobs"), "textures/items/emerald")
            .button(t(player, "btn.leave_job"), "textures/blocks/barrier")
            .button(t(player, "btn.statistics"), "textures/items/experience_bottle")
            .button(t(player, "btn.upgrades"), "textures/items/nether_star")
            .button(t(player, "btn.quests"), "textures/items/book_enchanted")
            .button(t(player, "btn.achievements"), "textures/items/diamond")
            .button(t(player, "btn.activity"), "textures/items/clock_item")
            .button("§6Leaderboards\n§7Top earners & levels", "textures/items/book_enchanted")
            .button("§bHistory Log\n§7Recent milestones", "textures/items/book_written")
            .button("§5Notifications\n§7Toggle message noise", "textures/items/experience_bottle")
            .button(t(player, "btn.language"), "textures/items/map_empty")
            .button(t(player, "btn.help"), "textures/items/paper")
            .button(t(player, "btn.close"), "textures/blocks/barrier");

        try {
            const response = await form.show(player);
            if (response.canceled) return;

            playJobSound(player, 'menuSelect');

            switch (response.selection) {
                case 0: await this.showMyJobs(player); break;
                case 1: await this.showJoinJob(player); break;
                case 2: await this.showLeaveJob(player); break;
                case 3: await this.showStatistics(player); break;
                case 4: await this.showUpgrades(player); break;
                case 5: await this.showQuests(player); break;
                case 6: await this.showAchievements(player); break;
                case 7: await this.showActivity(player); break;
                case 8: await this.showLeaderboardMenu(player); break;
                case 9: await this.showHistoryLog(player); break;
                case 10: await this.showNotificationSettings(player); break;
                case 11: await this.showLanguageMenu(player, { returnToMain: true }); break;
                case 12: await this.showHelp(player); break;
                default: return;
            }
        } catch (error) {
            console.error("[Jobs] GUI Error:", error);
        }
    }

    async showLanguageMenu(player, options = {}) {
        const returnToMain = options.returnToMain ?? false;
        const hasLang = hasPlayerLang(player);
        const current = getPlayerLang(player);

        const form = new ActionFormData()
            .title(t(player, "ui.language.title"))
            .body(t(player, "ui.language.body"));

        for (const lang of LANGUAGES) {
            const mark = lang.code === current ? " §a✓" : "";
            form.button(`§f${lang.label}${mark}`, "textures/items/map_empty");
        }

        if (hasLang) {
            form.button(t(player, "btn.back"), "textures/items/arrow");
        }

        try {
            const response = await form.show(player);
            if (response.canceled) return;

            const max = LANGUAGES.length;
            if (response.selection < max) {
                const selected = LANGUAGES[response.selection];
                setPlayerLang(player, selected.code);
                player.onScreenDisplay.setActionBar(t(player, "ui.language.saved", { lang: selected.label }));
                playJobSound(player, 'success');
            }

            if (returnToMain || hasLang) {
                system.runTimeout(() => this.showMainMenu(player), 2);
            }
        } catch (error) {
            console.error("[Jobs] Language GUI Error:", error);
        }
    }

    async showMyJobs(player) {
        const data = this.data.getPlayerData(player);
        const form = new ActionFormData()
            .title(t(player, "title.my_jobs"))
            .body(`§7Select a job to view details:\n§8Active: ${data.jobs.size}/${CONFIG.MAX_JOBS}`);
        
        const jobArray = Array.from(data.jobs);
        if (jobArray.length === 0) {
            form.button("§cNo Active Jobs\n§7Click to browse", "textures/blocks/barrier");
        } else {
            for (const jobId of jobArray) {
                const stats = this.data.getJobStats(player, jobId);
                const upgradeCount = stats.unlockedUpgrades.length;
                const totalUpgrades = JOBS[jobId.toUpperCase()].upgrades.length;
                const limitText = CONFIG.JOB_LIMIT_ENABLED ? ` §8| §3${stats.limitInfo.remaining} Activity` : "";
                
                form.button(
                    `${stats.job.color}${jobNamePlain(player, jobId)}\n§7Lv.${stats.level} §8| §a$${formatNumber(stats.earnings)} §8| §e${upgradeCount}/${totalUpgrades} Upgrades${limitText}`,
                    jobIconPath(stats.job)
                );
            }
        }
        
        form.button("§7« Back", "textures/items/arrow");
        
        try {
            const response = await form.show(player);
            if (response.canceled) return;
            
            if (jobArray.length === 0 && response.selection === 0) {
                await this.showJoinJob(player);
            } else if (response.selection < jobArray.length) {
                await this.showJobDetails(player, jobArray[response.selection]);
            } else {
                await this.showMainMenu(player);
            }
        } catch (error) {
            console.error(error);
        }
    }
    
    async showJobDetails(player, jobId) {
        const stats = this.data.getJobStats(player, jobId);
        if (!stats) return;
        
        const nextUpgrade = stats.job.upgrades.find(u => u.level > stats.level);
        
        let body = `${stats.job.description}\n\n`;
        body += `§6--- Progress ---§r\n`;
        body += `§7Level: ${stats.level} §6(+${stats.bonus}% bonus)\n`;
        body += `§7XP: ${formatNumber(stats.xp)}/${formatNumber(stats.xpNeeded)}\n`;
        body += `${createProgressBar(stats.xp, stats.xpNeeded, 15)}\n\n`;
        
        body += `§6--- Earnings ---§r\n`;
        body += `§7Job Total: §a$${formatNumber(stats.earnings)}\n`;
        body += `§7Daily Salary: §a$${formatNumber(stats.job.baseSalary * stats.level)}\n\n`;
        
        if (stats.unlockedUpgrades.length > 0) {
            body += `§6--- Unlocked Upgrades ---§r\n`;
            body += stats.unlockedUpgrades.map(u => `§a- ${u}`).join('\n') + '\n\n';
        }
        
        if (nextUpgrade) {
            body += `§6--- Next Upgrade ---§r\n`;
            body += `§e${nextUpgrade.name} §7(Lv. ${nextUpgrade.level})\n`;
            body += `§8${nextUpgrade.bonus}\n\n`;
        }
        
        if (CONFIG.JOB_LIMIT_ENABLED) {
            body += `§6--- Activity Limit ---§r\n`;
            body += `${createProgressBar(stats.limitInfo.remaining, stats.limitInfo.remaining + (CONFIG.BASE_JOB_LIMIT + (stats.level * 3) - stats.limitInfo.remaining), 15)}\n`;
            body += `§7${stats.limitInfo.remaining} actions remaining\n`;
        }
        
        const form = new ActionFormData()
            .title(`§l${stats.job.color}${jobNamePlain(player, jobId)}`)
            .body(body)
            .button("§5View Upgrades", "textures/items/nether_star")
            .button("§dView Quests", "textures/items/book_enchanted")
            .button("§cLeave Job", "textures/blocks/barrier")
            .button("§7« Back", "textures/items/arrow");
        
        try {
            const response = await form.show(player);
            if (response.canceled) return;
            
            switch (response.selection) {
                case 0: await this.showJobUpgrades(player, jobId); break;
                case 1: await this.showJobQuests(player, jobId); break;
                case 2: await this.confirmLeaveJob(player, jobId); break;
                default: await this.showMyJobs(player);
            }
        } catch (error) {
            console.error(error);
        }
    }
    
    async showJoinJob(player) {
        const data = this.data.getPlayerData(player);
        const form = new ActionFormData()
            .title(t(player, "title.browse_jobs"))
            .body("§7Select a profession to begin your career:\n§8Hover over icons for details");
        
        const jobEntries = Object.entries(JOBS);
        for (const [key, job] of jobEntries) {
            const check = this.data.canJoinJob(player, job.id);
            const status = check.canJoin ? `§a$${job.baseSalary}/day` : `§c${check.reason.replace('§c', '')}`;
            
            form.button(
                `${job.color}${jobNamePlain(player, job.id)}\n§7${status} §8| §b${job.upgrades.length} upgrades`,
                jobIconPath(job)
            );
        }
        
        form.button("§7« Back", "textures/items/arrow");
        
        try {
            const response = await form.show(player);
            if (response.canceled) return;
            
            if (response.selection < jobEntries.length) {
                const [key, job] = jobEntries[response.selection];
                await this.confirmJoinJob(player, job.id);
            } else {
                await this.showMainMenu(player);
            }
        } catch (error) {
            console.error(error);
        }
    }
    
    async confirmJoinJob(player, jobId) {
        const job = JOBS[jobId.toUpperCase()];
        const check = this.data.canJoinJob(player, jobId);
        
        if (!check.canJoin) {
            player.sendMessage(check.reason);
            return;
        }
        
        const form = new MessageFormData()
            .title(`Join ${jobNamePlain(player, jobId)}?`)
            .body(
                `${job.description}\n\n` +
                `§6Benefits:§r\n` +
                `§7• Base Salary: §a$${job.baseSalary}/day\n` +
                `§7• Max Bonus: §a+${CONFIG.MAX_LEVEL * CONFIG.LEVEL_BONUS_PERCENT}%\n` +
                `§7• Upgrades: §e${job.upgrades.length}\n` +
                `§7• Category: §b${job.category}\n\n` +
                `§aJoin this profession?`
            )
            .button1("Join")
            .button2("Cancel");
        
        try {
            const response = await form.show(player);
            if (response.canceled || response.selection === 1) return;
            
            this.data.joinJob(player, jobId);
            if (this.data.shouldNotify(player, 'systemTips')) player.sendMessage(t(player, "job.joined", { job: jobNameColored(player, jobId), command: MENU_COMMAND }));
            playJobSound(player, 'success');
        } catch (error) {
            playJobSound(player, 'warning');
            player.sendMessage(`§c${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    async showLeaveJob(player) {
        const data = this.data.getPlayerData(player);
        const form = new ActionFormData()
            .title(t(player, "title.leave_job"))
            .body("§7Select a job to leave:\n§c[!] 5-minute cooldown applies!");
        
        const jobArray = Array.from(data.jobs);
        if (jobArray.length === 0) {
            form.button("§cNo Jobs to Leave", "textures/blocks/barrier");
        } else {
            for (const jobId of jobArray) {
                const stats = this.data.getJobStats(player, jobId);
                form.button(
                    `${stats.job.color}${jobNamePlain(player, jobId)}\n§7Lv.${stats.level} §8| §a$${formatNumber(stats.earnings)}`,
                    jobIconPath(stats.job)
                );
            }
        }
        
        form.button("§7« Back", "textures/items/arrow");
        
        try {
            const response = await form.show(player);
            if (response.canceled) return;
            
            if (jobArray.length > 0 && response.selection < jobArray.length) {
                await this.confirmLeaveJob(player, jobArray[response.selection]);
            } else {
                await this.showMainMenu(player);
            }
        } catch (error) {
            console.error(error);
        }
    }
    
    async confirmLeaveJob(player, jobId) {
        const stats = this.data.getJobStats(player, jobId);
        
        const form = new MessageFormData()
            .title(`§cLeave ${jobNamePlain(player, jobId)}?`)
            .body(
                `§c[!] Warning: You will lose:§r\n` +
                `§7• Level ${stats.level} progress\n` +
                `§7• ${stats.unlockedUpgrades.length} unlocked upgrades\n` +
                `§7• All job-specific XP\n\n` +
                `§aYou keep:§r\n` +
                `§7• Earned money: $${formatNumber(stats.earnings)}\n\n` +
                `§c5-minute rejoin cooldown!`
            )
            .button1("§cLeave")
            .button2("§aStay");
        
        try {
            const response = await form.show(player);
            if (response.canceled || response.selection === 1) return;
            
            this.data.leaveJob(player, jobId);
            if (this.data.shouldNotify(player, 'systemTips')) player.sendMessage(t(player, "job.left", { job: jobNameColored(player, jobId) }));
            playJobSound(player, 'warning', { pitch: 0.75 });
        } catch (error) {
            playJobSound(player, 'warning');
            player.sendMessage(`§c${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    async showJobUpgrades(player, jobId) {
        const stats = this.data.getJobStats(player, jobId);
        const available = this.data.getAvailableUpgrades(player, jobId);

        let body = `§7Unlock powerful bonuses!\n\n`;
        body += `§6Unlocked: §e${stats.unlockedUpgrades.length}§7/§e${stats.job.upgrades.length}\n\n`;

        if (available.length > 0) {
            body += `§6Available:§r\n`;
            body += available.map(u => `§e• ${u.name} §7(Lv. ${u.level}) §8- §a$${formatNumber(getUpgradeCost(u))}\n  §8${u.bonus}`).join('\n\n');
        } else {
            body += `§aAll upgrades unlocked!`;
        }

        const form = new ActionFormData()
            .title(`§l§5${jobNamePlain(player, jobId)} Upgrades`)
            .body(body);

        if (available.length > 0) {
            for (const upgrade of available) {
                form.button(`§e${upgrade.name}\n§7Lv ${upgrade.level} • $${formatNumber(getUpgradeCost(upgrade))}`, "textures/items/nether_star");
            }
        }

        form.button("§7« Back", "textures/items/arrow");

        try {
            const response = await form.show(player);
            if (response.canceled) return;

            if (available.length > 0 && response.selection < available.length) {
                await this.confirmUnlockUpgrade(player, jobId, available[response.selection]);
            } else {
                await this.showJobDetails(player, jobId);
            }
        } catch (error) {
            console.error(error);
        }
    }

    async confirmUnlockUpgrade(player, jobId, upgrade) {
        const form = new MessageFormData()
            .title(`§lUnlock ${upgrade.name}?`)
            .body(
                `§6${upgrade.name}§r\n` +
                `§7${upgrade.bonus}\n` +
                `§7Cost: §a$${formatNumber(getUpgradeCost(upgrade))}\n\n` +
                `§aUnlock now?`
            )
            .button1("§aUnlock")
            .button2("§cCancel");

        try {
            const response = await form.show(player);
            if (response.canceled || response.selection === 1) {
                await this.showJobUpgrades(player, jobId);
                return;
            }

            const result = this.data.unlockUpgrade(player, jobId, upgrade.name);
            if (result.success) {
                player.sendMessage(`§a* Unlocked: ${upgrade.name}`);
                player.sendMessage(`§7${upgrade.bonus}`);
                if (CONFIG.UPGRADE_COSTS_ENABLED) {
                    player.sendMessage(`§7Cost paid: §a$${formatNumber(result.cost)}`);
                }
                playJobSound(player, 'success');
            } else if (result.reason) {
                playJobSound(player, 'warning');
                player.sendMessage(`§c${result.reason}`);
            }
            await this.showJobUpgrades(player, jobId);
        } catch (error) {
            console.error(error);
        }
    }

    async showUpgrades(player) {
        const data = this.data.getPlayerData(player);
        const form = new ActionFormData()
            .title("§l§5Job Upgrades")
            .body("§7Select a job to view upgrades:");
        
        const jobArray = Array.from(data.jobs);
        if (jobArray.length === 0) {
            form.button("§cNo Active Jobs", "textures/blocks/barrier");
        } else {
            for (const jobId of jobArray) {
                const stats = this.data.getJobStats(player, jobId);
                form.button(
                    `${stats.job.color}${jobNamePlain(player, jobId)}\n§7${stats.unlockedUpgrades.length}/${stats.job.upgrades.length} unlocked`,
                    jobIconPath(stats.job)
                );
            }
        }
        
        form.button("§7« Back", "textures/items/arrow");
        
        try {
            const response = await form.show(player);
            if (response.canceled) return;
            
            if (jobArray.length > 0 && response.selection < jobArray.length) {
                await this.showJobUpgrades(player, jobArray[response.selection]);
            } else {
                await this.showMainMenu(player);
            }
        } catch (error) {
            console.error(error);
        }
    }
    
    async showQuests(player) {
        const data = this.data.getPlayerData(player);
        const form = new ActionFormData()
            .title("§l§dDaily Quests")
            .body("§7Select a job to view quests:");
        
        const jobArray = Array.from(data.jobs);
        if (jobArray.length === 0) {
            form.button("§cNo Active Jobs", "textures/blocks/barrier");
        } else {
            for (const jobId of jobArray) {
                const quests = QUESTS[jobId] || [];
                const completed = this.data.completedQuests.get(player.id) || new Set();
                const completedCount = quests.filter(q => completed.has(q.id)).length;
                form.button(
                    `${JOBS[jobId.toUpperCase()].color}${jobNamePlain(player, jobId)}\n§7${completedCount}/${quests.length} completed`,
                    jobIconPath(JOBS[jobId.toUpperCase()])
                );
            }
        }
        
        form.button("§7« Back", "textures/items/arrow");
        
        try {
            const response = await form.show(player);
            if (response.canceled) return;
            
            if (jobArray.length > 0 && response.selection < jobArray.length) {
                await this.showJobQuests(player, jobArray[response.selection]);
            } else {
                await this.showMainMenu(player);
            }
        } catch (error) {
            console.error(error);
        }
    }
    
    async showJobQuests(player, jobId) {
        const quests = QUESTS[jobId] || [];
        const progress = this.data.questProgress.get(player.id) || new Map();
        const completed = this.data.completedQuests.get(player.id) || new Set();
        
        let body = `§7Complete quests for bonus rewards!\n\n`;
        
        for (const quest of quests) {
            const current = progress.get(quest.id) || 0;
            const isDone = completed.has(quest.id);
            const status = isDone ? "§aDONE" : `§e${current}/${quest.target}`;
            const bar = createProgressBar(current, quest.target, 10);
            
            body += `§6${quest.name}§r\n`;
            body += `${bar}\n`;
            body += `§7${status} §8| §a$${formatNumber(quest.reward)}\n\n`;
        }
        
        const form = new ActionFormData()
            .title(`§l${JOBS[jobId.toUpperCase()].color}${jobNamePlain(player, jobId)} Quests`)
            .body(body)
            .button("§7« Back", "textures/items/arrow");
        
        try {
            await form.show(player);
            await this.showQuests(player);
        } catch (error) {
            console.error(error);
        }
    }
    
    async showAchievements(player) {
        const playerAch = this.data.achievements.get(player.id) || new Set();
        const total = Object.keys(ACHIEVEMENTS).length;
        const unlocked = playerAch.size;
        
        let body = `§7Progress: §e${unlocked}§7/§e${total}\n\n`;
        
        for (const ach of Object.values(ACHIEVEMENTS)) {
            const isUnlocked = playerAch.has(ach.id);
            const icon = isUnlocked ? "§a[x]" : "§8[ ]";
            const color = isUnlocked ? "§6" : "§8";
            
            body += `${icon} ${color}${ach.name}§r\n`;
            body += `§7${ach.description}\n`;
            body += `§7Reward: §a$${formatNumber(ach.reward)}\n\n`;
        }
        
        const form = new ActionFormData()
            .title(t(player, "title.achievements"))
            .body(body)
            .button("§7« Back", "textures/items/arrow");
        
        try {
            await form.show(player);
            await this.showMainMenu(player);
        } catch (error) {
            console.error(error);
        }
    }
    
    async showActivity(player) {
        const data = this.data.getPlayerData(player);
        let body = "§6--- Job Activity Limits ---§r\n\n";
        
        if (!CONFIG.JOB_LIMIT_ENABLED) {
            body += "§7Job limits are currently §cdisabled§7.\n";
        } else if (data.jobs.size === 0) {
            body += "§cNo active jobs to track.\n";
        } else {
            body += "§7Limits prevent spam and encourage diversification.\n";
            body += `§7Regenerates ${CONFIG.LIMIT_REGEN_RATE} actions every ${CONFIG.LIMIT_REGEN_INTERVAL / 20}s\n\n`;
            
            for (const jobId of data.jobs) {
                const stats = this.data.getJobStats(player, jobId);
                const max = CONFIG.BASE_JOB_LIMIT + (stats.level * 3);
                const used = max - stats.limitInfo.remaining;
                
                body += `${stats.job.color}${jobNamePlain(player, jobId)}§r\n`;
                body += `${createProgressBar(stats.limitInfo.remaining, max, 15)}\n`;
                body += `§7${stats.limitInfo.remaining}/${max} remaining\n\n`;
            }
        }
        
        const form = new ActionFormData()
            .title("§l§3Activity Status")
            .body(body)
            .button("§7« Back", "textures/items/arrow");
        
        try {
            await form.show(player);
            await this.showMainMenu(player);
        } catch (error) {
            console.error(error);
        }
    }
    
    async showStatistics(player) {
        const data = this.data.getPlayerData(player);
        const stats = this.data.sessionStats.get(player.id);
        
        let body = `§6--- Career Statistics ---§r\n\n`;
        body += `§7Total Earnings: §a$${formatNumber(data.totalEarnings)}\n`;
        body += `§7Active Jobs: §e${data.jobs.size}§7/§e${CONFIG.MAX_JOBS}\n`;
        body += `§7Quests Completed: §b${data.totalQuests}\n`;
        body += `§7Achievements: §d${this.data.achievements.get(player.id)?.size || 0}\n\n`;
        
        if (stats) {
            const sessionTime = Math.floor((Date.now() - stats.startTime) / 60000);
            body += `§6--- Session Stats ---§r\n`;
            body += `§7Play Time: §e${sessionTime} minutes\n`;
            body += `§7Blocks Broken: §e${formatNumber(stats.blocksBroken)}\n`;
            body += `§7Blocks Placed: §e${formatNumber(stats.blocksPlaced)}\n`;
            body += `§7Mobs Killed: §e${formatNumber(stats.mobsKilled)}\n\n`;
        }
        
        if (data.jobs.size > 0) {
            body += `§6--- Job Breakdown ---§r\n`;
            for (const jobId of data.jobs) {
                const jobStats = this.data.getJobStats(player, jobId);
                body += `\n${jobStats.job.color}${jobNamePlain(player, jobId)}§r\n`;
                body += `§7Lv.${jobStats.level} | $${formatNumber(jobStats.earnings)}\n`;
                body += `§7Upgrades: ${jobStats.unlockedUpgrades.length}/${jobStats.job.upgrades.length}\n`;
            }
        }
        
        // Add leaderboard
        body += `\n§6--- Top Earners ---§r\n`;
        const top = this.data.getTopEarners(3);
        top.forEach((p, i) => {
            const medal = i === 0 ? "§6[1st]" : i === 1 ? "§7[2nd]" : "§c[3rd]";
            body += `${medal} §7${p.name}: §a$${formatNumber(p.earnings)}\n`;
        });
        
        const form = new ActionFormData()
            .title(t(player, "title.statistics"))
            .body(body)
            .button("§7« Back", "textures/items/arrow");
        
        try {
            await form.show(player);
            await this.showMainMenu(player);
        } catch (error) {
            console.error(error);
        }
    }
    
    async showLeaderboardMenu(player) {
        const form = new ActionFormData()
            .title('§l§6Leaderboards')
            .body('§7Competitive overview for currently online players.')
            .button('§6Top Total Earners\n§7Whole server', 'textures/items/emerald')
            .button('§eTop Job Earners\n§7Per job', 'textures/items/gold_ingot')
            .button('§bTop Job Levels\n§7Per job', 'textures/items/experience_bottle')
            .button('§7« Back', 'textures/items/arrow');

        try {
            const response = await form.show(player);
            if (response.canceled) return;
            if (response.selection === 0) return await this.showLeaderboardResults(player, null, 'earnings');
            if (response.selection === 1) return await this.showJobLeaderboardPicker(player, 'earnings');
            if (response.selection === 2) return await this.showJobLeaderboardPicker(player, 'level');
            return await this.showMainMenu(player);
        } catch (error) {
            console.error(error);
        }
    }

    async showJobLeaderboardPicker(player, metric = 'earnings') {
        const form = new ActionFormData()
            .title(metric === 'level' ? '§l§bJob Level Leaderboards' : '§l§eJob Earnings Leaderboards')
            .body('§7Choose a job:');

        const jobEntries = Object.values(JOBS);
        for (const job of jobEntries) {
            form.button(`${job.color}${jobNamePlain(player, job.id)}
§7${metric === 'level' ? 'Highest levels' : 'Highest earners'}`, jobIconPath(job));
        }
        form.button('§7« Back', 'textures/items/arrow');

        try {
            const response = await form.show(player);
            if (response.canceled) return;
            if (response.selection < jobEntries.length) {
                return await this.showLeaderboardResults(player, jobEntries[response.selection].id, metric);
            }
            return await this.showLeaderboardMenu(player);
        } catch (error) {
            console.error(error);
        }
    }

    async showLeaderboardResults(player, jobId = null, metric = 'earnings') {
        const entries = jobId
            ? this.data.getJobLeaderboard(jobId, metric, CONFIG.LEADERBOARD_GUI_ENTRIES)
            : this.data.getTopEarners(CONFIG.LEADERBOARD_GUI_ENTRIES);

        let title = '§l§6Top Total Earners';
        if (jobId && metric === 'earnings') title = `§l${JOBS[jobId.toUpperCase()]?.color || '§e'}${jobNamePlain(player, jobId)} Earners`;
        if (jobId && metric === 'level') title = `§l${JOBS[jobId.toUpperCase()]?.color || '§b'}${jobNamePlain(player, jobId)} Levels`;

        let body = '§7Currently tracked from online players.\n\n';
        if (entries.length === 0) {
            body += '§8No players qualify yet.';
        } else {
            entries.forEach((entry, index) => {
                const medal = index === 0 ? '§6#1' : index === 1 ? '§7#2' : index === 2 ? '§c#3' : `§8#${index + 1}`;
                if (!jobId) {
                    body += `${medal} §f${entry.name}\n§7Total Earnings: §a$${formatNumber(entry.earnings)}\n\n`;
                } else if (metric === 'level') {
                    body += `${medal} §f${entry.name}\n§7Level: §b${entry.value} §8| §a$${formatNumber(entry.earnings)}\n\n`;
                } else {
                    body += `${medal} §f${entry.name}\n§7Job Earnings: §a$${formatNumber(entry.value)} §8| §bLv.${entry.level}\n\n`;
                }
            });
        }

        const form = new ActionFormData()
            .title(title)
            .body(body)
            .button('§7« Back', 'textures/items/arrow');

        try {
            await form.show(player);
            if (!jobId) return await this.showLeaderboardMenu(player);
            return await this.showJobLeaderboardPicker(player, metric);
        } catch (error) {
            console.error(error);
        }
    }

    async showHistoryLog(player) {
        const entries = this.data.getHistory(player, CONFIG.HISTORY_GUI_ENTRIES);
        let body = '§7Recent rewards, quest completions, and level-up moments.\n\n';

        if (entries.length === 0) {
            body += '§8No history recorded yet.';
        } else {
            body += entries.map(entry => {
                const jobPrefix = entry.jobId ? `${jobNameColored(player, entry.jobId)} §8• §r` : '';
                return `${getHistoryIcon(entry.type)} ${jobPrefix}§f${entry.title}\n§7${entry.detail}\n§8${formatHistoryTimestamp(entry.timestamp)}`;
            }).join('\n\n');
        }

        const form = new ActionFormData()
            .title('§l§bHistory Log')
            .body(body)
            .button('§cClear History', 'textures/blocks/barrier')
            .button('§7« Back', 'textures/items/arrow');

        try {
            const response = await form.show(player);
            if (response.canceled) return;
            if (response.selection === 0) {
                this.data.clearHistory(player);
                return await this.showHistoryLog(player);
            }
            return await this.showMainMenu(player);
        } catch (error) {
            console.error(error);
        }
    }

    async showNotificationSettings(player) {
        const settings = this.data.getNotificationSettings(player);
        const form = new ModalFormData()
            .title('§l§5Notification Settings')
            .toggle('Reward chat messages', settings.rewardChat)
            .toggle('Reward action bar popups', settings.rewardActionBar)
            .toggle('Quest completion messages', settings.questMessages)
            .toggle('Achievement messages', settings.achievementMessages)
            .toggle('Level-up messages', settings.levelUpMessages)
            .toggle('Salary payout messages', settings.salaryMessages)
            .toggle('System tips and reminders', settings.systemTips);

        try {
            const response = await form.show(player);
            if (response.canceled) return;
            const values = response.formValues || [];
            this.data.updateNotificationSettings(player, {
                rewardChat: Boolean(values[0]),
                rewardActionBar: Boolean(values[1]),
                questMessages: Boolean(values[2]),
                achievementMessages: Boolean(values[3]),
                levelUpMessages: Boolean(values[4]),
                salaryMessages: Boolean(values[5]),
                systemTips: Boolean(values[6])
            });
            player.sendMessage('§aNotification settings updated.');
            playJobSound(player, 'success');
            await this.showMainMenu(player);
        } catch (error) {
            console.error(error);
        }
    }

    async showHelp(player) {
        const form = new ActionFormData()
            .title("§l§9Jobs Help")
            .body(
                `§6--- Getting Started ---§r\n` +
                `§7• Use §e${MENU_COMMAND} §7to open this menu\n` +
                `§7• Join up to §e${CONFIG.MAX_JOBS} §7jobs simultaneously\n` +
                `§7• Perform job activities to earn money and XP\n` +
                `§7• Level up to increase earnings and unlock upgrades\n\n` +
                
                `§6--- Available Jobs ---§r\n` +
                Object.values(JOBS).map(j => `${j.color}• ${jobNamePlain(player, j.id)} §7- ${categoryName(player, j.category)}`).join('\n') +
                `\n\n§6--- Tips ---§r\n` +
                `§7• Higher job levels = bigger earnings\n` +
                `§7• Complete quests for bonus rewards\n` +
                `§7• Watch your activity limits (regenerate over time)\n` +
                `§7• 5-minute cooldown when leaving jobs\n` +
                `§7• Use §e!jbal §7to check balance\n` +
                `§7• Use §e!jpay <player> <amount> §7to transfer money`
            )
            .button("§7« Back", "textures/items/arrow");
        
        try {
            await form.show(player);
            await this.showMainMenu(player);
        } catch (error) {
            console.error(error);
        }
    }
}

// ==========================================
// EVENT MANAGER
// ==========================================

/**
 * Handles all game events with robust error handling
 */
class EventManager {
    constructor(dataManager, gui) {
        this.data = dataManager;
        this.gui = gui;
        this.recentBlocks = new Map();
        this.fishingPlayers = new Map();
        this.interactionContext = new Map();
        this.inventoryDebits = new Map();
        this.inventoryCredits = new Map();
        this.pendingDebitChecks = new Set();
        this.recentBrokenLocations = new Map();
        this.builderRewardLocations = new Map();
        this.setupEvents();
    }

    sendRewardChat(player, message) {
        if (message && this.data.shouldNotify(player, 'rewardChat')) player.sendMessage(message);
    }

    sendRewardActionBar(player, message, chance = 1) {
        if (message && this.data.shouldNotify(player, 'rewardActionBar') && Math.random() < chance) {
            player.onScreenDisplay.setActionBar(message);
        }
    }

    setupEvents() {
        world.afterEvents.playerBreakBlock?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handleBlockBreak(e); } catch (error) { console.error('[Jobs] Block break error:', error); }
        });

        world.afterEvents.playerPlaceBlock?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handleBlockPlace(e); } catch (error) { console.error('[Jobs] Block place error:', error); }
        });

        world.afterEvents.entityDie?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handleEntityDeath(e); } catch (error) { console.error('[Jobs] Entity death error:', error); }
        });

        world.afterEvents.itemUse?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handleItemUse(e); } catch (error) { console.error('[Jobs] Item use error:', error); }
        });
        world.afterEvents.playerInteractWithBlock?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handlePlayerInteractWithBlock(e); } catch (error) { console.error('[Jobs] Block interaction error:', error); }
        });

        world.afterEvents.playerInteractWithEntity?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handlePlayerInteractWithEntity(e); } catch (error) { console.error('[Jobs] Entity interaction error:', error); }
        });

        world.afterEvents.playerInventoryItemChange?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handleInventoryChange(e); } catch (error) { console.error('[Jobs] Inventory change error:', error); }
        });

        world.afterEvents.playerDimensionChange?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handleDimensionChange(e); } catch (error) { console.error('[Jobs] Dimension change error:', error); }
        });

        world.afterEvents.playerSpawn?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try {
                if (e.initialSpawn) this.handlePlayerSpawn(e.player);
            } catch (error) {
                console.error('[Jobs] Player spawn error:', error);
            }
        });

        world.beforeEvents.chatSend?.subscribe((e) => {
            if (!isJobsSystemEnabled()) return;
            try { this.handleChatCommand(e); } catch (error) { console.error('[Jobs] Chat command error:', error); }
        });
    }

    getLocationKey(playerId, location) {
        return `${playerId}_${location.x}_${location.y}_${location.z}`;
    }

    setContext(playerId, kind, extra = {}, duration = CONFIG.INTERACTION_CONTEXT_TICKS) {
        this.interactionContext.set(playerId, {
            kind,
            expiresAt: system.currentTick + duration,
            ...extra
        });
    }

    getContext(playerId, kinds = null) {
        const ctx = this.interactionContext.get(playerId);
        if (!ctx) return null;
        if (ctx.expiresAt < system.currentTick) {
            this.interactionContext.delete(playerId);
            return null;
        }
        if (kinds && ![].concat(kinds).includes(ctx.kind)) return null;
        return ctx;
    }

    clearContext(playerId, kind = null) {
        if (!kind) {
            this.interactionContext.delete(playerId);
            return;
        }
        const ctx = this.interactionContext.get(playerId);
        if (ctx?.kind === kind) this.interactionContext.delete(playerId);
    }

    recordInventoryDebit(playerId, typeId, amount) {
        if (!typeId || amount <= 0) return;
        const bucket = this.inventoryDebits.get(playerId) || new Map();
        const current = bucket.get(typeId) || { amount: 0, tick: system.currentTick };
        current.amount += amount;
        current.tick = system.currentTick;
        bucket.set(typeId, current);
        this.inventoryDebits.set(playerId, bucket);
    }

    consumeInventoryDebit(playerId, typeId, amount) {
        const bucket = this.inventoryDebits.get(playerId);
        if (!bucket || !typeId || amount <= 0) return amount;
        const current = bucket.get(typeId);
        if (!current) return amount;
        if (system.currentTick - current.tick > 4) {
            bucket.delete(typeId);
            return amount;
        }
        const consumed = Math.min(current.amount, amount);
        current.amount -= consumed;
        if (current.amount <= 0) bucket.delete(typeId);
        return amount - consumed;
    }


    recordInventoryCredit(playerId, typeId, amount) {
        if (!typeId || amount <= 0) return;
        const bucket = this.inventoryCredits.get(playerId) || new Map();
        const current = bucket.get(typeId) || { amount: 0, tick: system.currentTick };
        current.amount += amount;
        current.tick = system.currentTick;
        bucket.set(typeId, current);
        this.inventoryCredits.set(playerId, bucket);
    }

    // Bukti trade beneran: ada item non-emerald yang MASUK inventory
    // dekat dengan saat emerald keluar (hasil trade villager).
    // Buang/lempar emerald atau masukin chest tidak menghasilkan credit, jadi tidak dibayar.
    hasRecentTradeCredit(playerId, sinceTick) {
        const bucket = this.inventoryCredits.get(playerId);
        if (!bucket) return false;
        for (const [typeId, entry] of bucket) {
            if (typeId !== 'minecraft:emerald' && entry.tick >= sinceTick) return true;
        }
        return false;
    }

    scheduleDebitResolution(player, itemType, contextKind, resolver) {
        const key = `${player.id}:${contextKind}:${itemType}`;
        if (this.pendingDebitChecks.has(key)) return;
        this.pendingDebitChecks.add(key);

        system.runTimeout(() => {
            this.pendingDebitChecks.delete(key);
            const ctx = this.getContext(player.id, contextKind);
            if (!ctx) return;
            const bucket = this.inventoryDebits.get(player.id);
            const entry = bucket?.get(itemType);
            if (!entry || entry.amount <= 0) return;
            if (system.currentTick - entry.tick > 4) {
                bucket.delete(itemType);
                return;
            }
            const amount = entry.amount;
            const lossTick = entry.tick;
            bucket.delete(itemType);
            resolver(amount, ctx, lossTick);
        }, 2);
    }

    handleBlockBreak(e) {
        const { player, brokenBlockPermutation, block } = e;
        const data = this.data.getPlayerData(player);
        if (!data || data.jobs.size === 0) return;

        const tracksBreakRewards = data.jobs.has('miner') || data.jobs.has('lumberjack') || data.jobs.has('farmer');
        const tracksBuilderLoop = data.jobs.has('builder');
        if (!tracksBreakRewards && !tracksBuilderLoop) {
            this.data.updateSessionStats(player, 'blocksBroken');
            return;
        }

        const blockType = brokenBlockPermutation.type.id;
        const blockKey = this.getLocationKey(player.id, block.location);
        if (this.recentBlocks.has(blockKey)) return;

        this.recentBlocks.set(blockKey, system.currentTick);
        system.runTimeout(() => this.recentBlocks.delete(blockKey), 40);
        if (tracksBuilderLoop) {
            this.recentBrokenLocations.set(blockKey, system.currentTick);
            system.runTimeout(() => this.recentBrokenLocations.delete(blockKey), CONFIG.BUILDER_LOOP_COOLDOWN_TICKS);
        }

        if (data.jobs.has('miner')) {
            const reward = REWARDS.BLOCKS[blockType];
            if (reward) {
                const rewardResult = this.data.addReward(player, 'miner', reward, blockType);
                const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.mining'));
                if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.3);
                this.data.updateQuestProgress(player, 'miner', 'block', blockType);
            }
        }

        if (data.jobs.has('lumberjack')) {
            const isLog = blockType.includes('log') || blockType.includes('stem');
            if (isLog) {
                const reward = REWARDS.BLOCKS[blockType] || 3;
                const rewardResult = this.data.addReward(player, 'lumberjack', reward, blockType);
                const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.woodcutting'));
                if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.3);
                this.data.updateQuestProgress(player, 'lumberjack', 'block', blockType);
            }
        }

        if (data.jobs.has('farmer')) {
            const reward = REWARDS.FARMING[blockType];
            if (reward) {
                const rewardResult = this.data.addReward(player, 'farmer', reward, blockType);
                const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.farming'));
                if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.3);
                this.data.updateQuestProgress(player, 'farmer', 'crop', blockType);
            }
        }

        this.data.updateSessionStats(player, 'blocksBroken');
    }

    handleBlockPlace(e) {
        const { player, block } = e;
        const data = this.data.getPlayerData(player);
        if (!data || data.jobs.size === 0) return;
        if (!data?.jobs.has('builder')) {
            this.data.updateSessionStats(player, 'blocksPlaced');
            return;
        }

        const blockType = block.typeId;
        const key = this.getLocationKey(player.id, block.location);
        const recentlyBroken = this.recentBrokenLocations.get(key);
        const recentlyRewarded = this.builderRewardLocations.get(key);
        const loopWindow = CONFIG.BUILDER_LOOP_COOLDOWN_TICKS;
        const isLoopPlacement = (recentlyBroken && system.currentTick - recentlyBroken <= loopWindow) || (recentlyRewarded && system.currentTick - recentlyRewarded <= loopWindow);

        if (!isLoopPlacement) {
            const reward = REWARDS.BLOCKS[blockType];
            if (reward && isBuildingBlock(blockType)) {
                const rewardResult = this.data.addReward(player, 'builder', Math.max(1, Math.floor(reward / 2)), blockType);
                const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.building'));
                if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.2);
                this.builderRewardLocations.set(key, system.currentTick);
                system.runTimeout(() => this.builderRewardLocations.delete(key), CONFIG.BUILDER_LOOP_COOLDOWN_TICKS);
            }
        }

        this.data.updateSessionStats(player, 'blocksPlaced');
    }

    handleEntityDeath(e) {
        if (!e.damageSource?.damagingEntity) return;
        const killer = e.damageSource.damagingEntity;
        if (!(killer instanceof Player)) return;

        const data = this.data.getPlayerData(killer);
        if (!data?.jobs.has('hunter')) return;
        const entityType = e.deadEntity.typeId;

        const reward = REWARDS.MOBS[entityType];
        if (reward) {
            const isBoss = ['minecraft:ender_dragon', 'minecraft:wither', 'minecraft:warden', 'minecraft:elder_guardian'].includes(entityType);
            const rewardResult = this.data.addReward(killer, 'hunter', reward, entityType);
            const rewardToast = formatRewardToast(rewardResult, t(killer, 'reward.hunting'));
            if (rewardResult.points > 0) {
                if (isBoss && rewardToast && this.data.shouldNotify(killer, 'rewardChat')) killer.sendMessage(`§c§l${rewardToast} §r§7(Boss Kill!)`);
                else this.sendRewardActionBar(killer, rewardToast, 0.3);
            }
            this.data.updateQuestProgress(killer, 'hunter', isBoss ? 'boss' : 'mob', entityType);
        }
        this.data.updateSessionStats(killer, 'mobsKilled');
    }

    handleItemUse(e) {
        const { source: player, itemStack } = e;
        if (!(player instanceof Player)) return;
        const itemType = itemStack.typeId;

        if (itemType === 'minecraft:clock') {
            if (!JOBS_ADDON_CONFIG.menu.enableClockMenu) return;
            if (CONFIG.REQUIRE_SNEAK_FOR_CLOCK_MENU && !player.isSneaking) return;
            openJobsMenu(player);
            return;
        }

        if (itemType === 'minecraft:fishing_rod') {
            const data = this.data.getPlayerData(player);
            if (!data?.jobs.has('fisherman')) return;
            this.fishingPlayers.set(player.id, system.currentTick + CONFIG.FISHING_WINDOW_TICKS);
        }
    }

    handleItemUseOn(e) {
        const player = e.source;
        if (!(player instanceof Player)) return;
        const blockType = e.block?.typeId;
        if (!blockType) return;
        this.trackStationInteraction(player, blockType);
    }

    handlePlayerInteractWithBlock(e) {
        if (!e.isFirstEvent) return;
        this.trackStationInteraction(e.player, e.block.typeId);
    }

    trackStationInteraction(player, blockType) {
        const data = this.data.getPlayerData(player);
        if (!data || !(
            data.jobs.has('crafter') ||
            data.jobs.has('enchanter') ||
            data.jobs.has('blacksmith') ||
            data.jobs.has('alchemist')
        )) return;

        if (data.jobs.has('crafter') && (blockType === 'minecraft:crafting_table' || blockType === 'minecraft:crafter')) {
            this.setContext(player.id, 'crafting', { blockType });
        }
        if (data.jobs.has('enchanter') && ['minecraft:enchanting_table', 'minecraft:anvil', 'minecraft:grindstone'].includes(blockType)) {
            this.setContext(player.id, 'enchanting', { blockType });
        }
        if (data.jobs.has('blacksmith') && ['minecraft:furnace', 'minecraft:blast_furnace', 'minecraft:smoker', 'minecraft:smithing_table', 'minecraft:anvil', 'minecraft:grindstone'].includes(blockType)) {
            this.setContext(player.id, 'blacksmith', { blockType });
        }
        if (data.jobs.has('alchemist') && blockType === 'minecraft:brewing_stand') {
            this.setContext(player.id, 'alchemy', { blockType });
        }
    }

    handlePlayerInteractWithEntity(e) {
        const { player, target } = e;
        const data = this.data.getPlayerData(player);
        if (!data?.jobs.has('merchant')) return;
        if (isTraderEntity(target.typeId)) {
            this.setContext(player.id, 'trading', { entityType: target.typeId }, CONFIG.INTERACTION_CONTEXT_TICKS * 2);
        }
    }

    handleInventoryChange(e) {
        const player = e.player;
        const data = this.data.getPlayerData(player);
        if (!data || !(
            data.jobs.has('fisherman') ||
            data.jobs.has('crafter') ||
            data.jobs.has('enchanter') ||
            data.jobs.has('blacksmith') ||
            data.jobs.has('alchemist') ||
            data.jobs.has('merchant')
        )) return;

        const changes = getInventoryChanges(e.beforeItemStack, e.itemStack);
        if (changes.length === 0) return;

        for (const change of changes) {
            if (change.delta < 0) {
                this.recordInventoryDebit(player.id, change.typeId, Math.abs(change.delta));
                continue;
            }

            const effectiveGain = this.consumeInventoryDebit(player.id, change.typeId, change.delta);
            if (effectiveGain <= 0) continue;
            this.recordInventoryCredit(player.id, change.typeId, effectiveGain);

            const fishingExpiry = this.fishingPlayers.get(player.id) || 0;
            if (data.jobs.has('fisherman') && fishingExpiry >= system.currentTick) {
                const reward = REWARDS.FISHING[change.typeId];
                if (reward) {
                    const isTreasure = ['minecraft:bow', 'minecraft:enchanted_book', 'minecraft:name_tag', 'minecraft:saddle', 'minecraft:nautilus_shell', 'minecraft:heart_of_the_sea'].includes(change.typeId);
                    const rewardResult = this.data.addReward(player, 'fisherman', reward * effectiveGain, change.typeId);
                    const rewardToast = formatRewardToast(rewardResult, isTreasure ? t(player, 'reward.treasure') : t(player, 'reward.fishing'));
                    if (rewardResult.points > 0) this.sendRewardChat(player, rewardToast);
                    this.data.updateQuestProgress(player, 'fisherman', isTreasure ? 'treasure' : 'fish', change.typeId, effectiveGain);
                    this.fishingPlayers.delete(player.id);
                    continue;
                }
            }

            const context = this.getContext(player.id);
            if (!context) continue;

            if (context.kind === 'crafting' && data.jobs.has('crafter')) {
                const reward = REWARDS.CRAFTING[change.typeId];
                if (reward) {
                    const rewardResult = this.data.addReward(player, 'crafter', reward * effectiveGain, change.typeId);
                    const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.crafting'));
                    if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.2);
                    this.data.updateQuestProgress(player, 'crafter', 'craft', getCraftQuestCategory(change.typeId), effectiveGain);
                }
                continue;
            }

            if (context.kind === 'blacksmith' && data.jobs.has('blacksmith')) {
                const reward = getBlacksmithReward(change.typeId);
                if (reward > 0) {
                    const rewardResult = this.data.addReward(player, 'blacksmith', reward * effectiveGain, change.typeId);
                    const rewardToast = formatRewardToast(rewardResult, 'Smithing');
                    if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.2);
                    this.data.updateQuestProgress(player, 'blacksmith', 'craft', getBlacksmithQuestCategory(change.typeId), effectiveGain);
                }
                continue;
            }

            if (context.kind === 'alchemy' && data.jobs.has('alchemist')) {
                const reward = getAlchemyReward(change.typeId);
                if (reward > 0) {
                    const rewardResult = this.data.addReward(player, 'alchemist', reward * effectiveGain, change.typeId);
                    const rewardToast = formatRewardToast(rewardResult, 'Brewing');
                    if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.2);
                    this.data.updateQuestProgress(player, 'alchemist', 'craft', getAlchemyQuestCategory(change.typeId), effectiveGain);
                }
                continue;
            }
        }

        const tradeContext = this.getContext(player.id, 'trading');
        if (tradeContext && data.jobs.has('merchant') && changes.some(change => change.typeId === 'minecraft:emerald' && change.delta < 0)) {
            this.scheduleDebitResolution(player, 'minecraft:emerald', 'trading', (spent, ctx, lossTick) => {
                // Anti-exploit: emerald keluar harus disertai item hasil trade yang masuk.
                // Klik villager lalu lempar/masukin chest emerald tidak lagi dibayar.
                if (!this.hasRecentTradeCredit(player.id, lossTick - 3)) return;
                const tier = getTradeTierBySpend(spent);
                const rewardKey = `${tier}_trade`;
                const reward = REWARDS.TRADING[rewardKey] || REWARDS.TRADING.common_trade;
                const rewardResult = this.data.addReward(player, 'merchant', reward * spent, rewardKey);
                const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.trading'));
                if (rewardResult.points > 0) this.sendRewardActionBar(player, rewardToast, 0.25);
                this.data.updateQuestProgress(player, 'merchant', 'trade', tier, 1);
                this.data.updateQuestProgress(player, 'merchant', 'spend', null, spent);
            });
        }

        const enchantContext = this.getContext(player.id, 'enchanting');
        if (enchantContext && data.jobs.has('enchanter') && changes.some(change => change.typeId === 'minecraft:lapis_lazuli' && change.delta < 0)) {
            this.scheduleDebitResolution(player, 'minecraft:lapis_lazuli', 'enchanting', (spent, ctx) => {
                const rewardResult = this.data.addReward(player, 'enchanter', 25 * spent, ctx.blockType?.replace('minecraft:', '') || 'enchanting_table');
                const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.enchanting'));
                if (rewardResult.points > 0) this.sendRewardChat(player, rewardToast);
            });
        }
    }

    handleDimensionChange(e) {
        const { player, toDimension } = e;
        const data = this.data.getPlayerData(player);
        if (!data?.jobs.has('explorer')) return;
        const dimId = toDimension.id;
        if (!this.data.canRewardExplorer(player, dimId)) return;

        let reward = 15;
        let type = 'dimension_overworld';
        if (dimId.includes('nether')) {
            reward = 50;
            type = 'dimension_nether';
        } else if (dimId.includes('end')) {
            reward = 100;
            type = 'dimension_end';
        }

        const rewardResult = this.data.addReward(player, 'explorer', reward, type);
        const rewardToast = formatRewardToast(rewardResult, t(player, 'reward.exploration'));
        if (rewardResult.points > 0) this.sendRewardChat(player, rewardToast);
        this.data.updateQuestProgress(player, 'explorer', 'dimension', type);
    }

    handlePlayerSpawn(player) {
        system.runTimeout(() => {
            if (!this.data.shouldNotify(player, 'systemTips')) return;
            if (!hasPlayerLang(player)) player.onScreenDisplay.setActionBar(t(player, 'system.use_clock', { command: MENU_COMMAND }));
            else player.onScreenDisplay.setActionBar(t(player, 'system.loaded'));
        }, 40);
    }

    handleChatCommand(e) {
        const { message, sender: player } = e;
        const args = message.trim().split(/\s+/);
        const cmd = args[0].toLowerCase();

        if (cmd === '!jobs' || cmd === '!jobgui') {
            e.cancel = true;
            openJobsMenu(player);
            return;
        }

        if (cmd === '!jbal' || cmd === '!balance' || cmd === '!money') {
            e.cancel = true;
            this.handleBalanceCommand(player);
            return;
        }

        if (cmd === '!jpay' || cmd === '!pay') {
            e.cancel = true;
            this.handlePayCommand(player, args);
            return;
        }

        if (cmd === '!jadmin') {
            e.cancel = true;
            this.handleAdminCommand(player, args);
            return;
        }

        if (cmd === '!jhelp') {
            e.cancel = true;
            player.sendMessage(
                `§6--- Jobs Commands ---§r\n` +
                `§7${MENU_COMMAND} §8- Open the jobs menu\n` +
                `§7/kiw:job_balance §8- Check balance\n` +
                `§7/kiw:job_pay <player> <amount> §8- Send currency\n` +
                `§7!jbal / !jpay §8- Legacy chat fallback\n` +
                `§7!jhelp §8- Show this help`
            );
            if (player.hasTag(CONFIG.ADMIN_TAG)) {
                player.sendMessage(
                    `§cAdmin slash commands:\n` +
                    `§c/kiw:job_admingive <player> <amount>\n` +
                    `§c/kiw:job_admintake <player> <amount>\n` +
                    `§c/kiw:job_adminreset <player>\n` +
                    `§c/kiw:job_adminsave\n` +
                    `§c/kiw:job_currency <objective> [copy|move|empty]\n` +
                    `§cLegacy: !jadmin currency <objective> [copy|move|empty]`
                );
            }
        }
    }

    handleBalanceCommand(player) {
        player.sendMessage(t(player, 'money.balance', { amount: formatCurrencyAmount(this.getPlayerScore(player)) }));
    }

    handlePayCommand(player, args) {
        if (args.length !== 3) {
            player.sendMessage(t(player, 'money.pay.usage'));
            playJobSound(player, 'warning');
            return false;
        }

        const target = this.findOnlinePlayer(args[1]);
        const amount = parsePositiveCurrencyAmount(args[2]);
        return this.payPlayer(player, target, amount, args[1]);
    }

    payPlayer(player, target, amount, targetName = null) {
        if (!amount) {
            player.sendMessage(t(player, 'money.pay.invalid'));
            playJobSound(player, 'warning');
            return false;
        }

        if (!target) {
            player.sendMessage(t(player, 'money.pay.not_found', { player: targetName || 'target' }));
            playJobSound(player, 'warning');
            return false;
        }

        if (target.id === player.id) {
            player.sendMessage(t(player, 'money.pay.self'));
            playJobSound(player, 'warning');
            return false;
        }

        const balance = this.getPlayerScore(player);
        if (balance < amount) {
            player.sendMessage(t(player, 'money.pay.insufficient', { balance: formatCurrencyAmount(balance) }));
            playJobSound(player, 'warning');
            return false;
        }

        const removed = this.addPlayerScore(player, -amount);
        if (removed !== -amount) {
            player.sendMessage('§cPayment failed because the sender balance could not be updated safely.');
            playJobSound(player, 'warning');
            return false;
        }

        const added = this.addPlayerScore(target, amount);
        if (added !== amount) {
            this.addPlayerScore(player, amount);
            player.sendMessage('§cPayment failed because the receiver balance could not be updated safely.');
            playJobSound(player, 'warning');
            return false;
        }

        player.sendMessage(t(player, 'money.pay.sent', { player: target.name, amount: formatCurrencyAmount(amount) }));
        target.sendMessage(t(target, 'money.pay.received', { amount: formatCurrencyAmount(amount), player: player.name }));
        playJobSound(player, 'paySend');
        playJobSound(target, 'payReceive');
        return true;
    }

    handleAdminCommand(player, args) {
        if (!this.hasAdminAccess(player)) {
            player.sendMessage(t(player, 'admin.no_permission'));
            playJobSound(player, 'warning');
            return false;
        }
        if (args.length < 2) {
            player.sendMessage(t(player, 'admin.usage'));
            playJobSound(player, 'warning');
            return false;
        }

        const subCmd = args[1].toLowerCase();
        switch (subCmd) {
            case 'give': {
                if (args.length !== 4) return this.sendAdminUsage(player, '§cUsage: !jadmin give <player> <amount>');
                return this.adminGive(player, this.findOnlinePlayer(args[2]), parsePositiveCurrencyAmount(args[3]), args[2]);
            }
            case 'take': {
                if (args.length !== 4) return this.sendAdminUsage(player, '§cUsage: !jadmin take <player> <amount>');
                return this.adminTake(player, this.findOnlinePlayer(args[2]), parsePositiveCurrencyAmount(args[3]), args[2]);
            }
            case 'reset': {
                if (args.length !== 3) return this.sendAdminUsage(player, '§cUsage: !jadmin reset <player>');
                return this.adminReset(player, this.findOnlinePlayer(args[2]), args[2]);
            }
            case 'reload':
            case 'save':
                return this.adminSave(player);
            case 'currency':
            case 'objective': {
                if (args.length < 3 || args.length > 4) return this.sendAdminUsage(player, '§cUsage: !jadmin currency <objective> [copy|move|empty]');
                return this.adminSetCurrency(player, args[2], args[3] || 'copy');
            }
            default:
                player.sendMessage('§cUnknown subcommand');
                playJobSound(player, 'warning');
                return false;
        }
    }

    hasAdminAccess(player) {
        return Boolean(player?.hasTag?.(CONFIG.ADMIN_TAG));
    }

    sendAdminUsage(player, message) {
        player.sendMessage(message);
        playJobSound(player, 'warning');
        return false;
    }

    findOnlinePlayer(name) {
        const raw = String(name ?? '').trim();
        if (!raw) return null;
        const players = world.getAllPlayers();
        return players.find(p => p.name === raw) || players.find(p => p.name.toLowerCase() === raw.toLowerCase()) || null;
    }

    adminGive(player, target, amount, targetName = null) {
        if (!this.hasAdminAccess(player)) return this.sendAdminUsage(player, t(player, 'admin.no_permission'));
        if (!target) return this.sendAdminUsage(player, `§cPlayer "${targetName || 'target'}" not found`);
        if (!amount) return this.sendAdminUsage(player, t(player, 'money.pay.invalid'));

        const added = this.addPlayerScore(target, amount);
        if (added !== amount) return this.sendAdminUsage(player, '§cCould not safely update the target balance.');

        player.sendMessage(`§aGave ${target.name} ${formatCurrencyAmount(amount)}`);
        target.sendMessage(`§aAdmin gave you ${formatCurrencyAmount(amount)}`);
        playJobSound(player, 'success');
        playJobSound(target, 'payReceive');
        return true;
    }

    adminTake(player, target, amount, targetName = null) {
        if (!this.hasAdminAccess(player)) return this.sendAdminUsage(player, t(player, 'admin.no_permission'));
        if (!target) return this.sendAdminUsage(player, `§cPlayer "${targetName || 'target'}" not found`);
        if (!amount) return this.sendAdminUsage(player, t(player, 'money.pay.invalid'));

        const current = this.getPlayerScore(target);
        const amountToTake = Math.min(amount, current);
        const removed = amountToTake === 0 ? 0 : this.addPlayerScore(target, -amountToTake);
        if (removed !== -amountToTake) return this.sendAdminUsage(player, '§cCould not safely update the target balance.');

        player.sendMessage(`§aTook ${formatCurrencyAmount(amountToTake)} from ${target.name}`);
        target.sendMessage(`§cAn admin removed ${formatCurrencyAmount(amountToTake)} from your balance.`);
        playJobSound(player, 'success');
        playJobSound(target, 'warning', { pitch: 0.7 });
        return true;
    }

    adminReset(player, target, targetName = null) {
        if (!this.hasAdminAccess(player)) return this.sendAdminUsage(player, t(player, 'admin.no_permission'));
        if (!target) return this.sendAdminUsage(player, `§cPlayer "${targetName || 'target'}" not found`);

        this.data.resetPlayerData(target);
        player.sendMessage(`§aReset all job data for ${target.name}`);
        target.sendMessage('§cYour job data has been reset by an admin');
        playJobSound(player, 'success');
        playJobSound(target, 'warning');
        return true;
    }

    adminSave(player) {
        if (!this.hasAdminAccess(player)) return this.sendAdminUsage(player, t(player, 'admin.no_permission'));
        this.data.saveAllData(true);
        player.sendMessage('§aSaved all dirty player data');
        playJobSound(player, 'success');
        return true;
    }

    adminSetCurrency(player, objectiveId, mode = 'copy') {
        if (!this.hasAdminAccess(player)) return this.sendAdminUsage(player, t(player, 'admin.no_permission'));

        const result = migrateCurrencyObjective(objectiveId, mode);
        if (!result.ok) return this.sendAdminUsage(player, `§cCurrency objective not changed: ${result.reason}`);

        this.data.setupObjectives();
        player.sendMessage(`§aCurrency objective changed from §e${result.oldObjectiveId} §ato §e${result.newObjectiveId}§a. Mode: §e${result.mode}§a. Migrated: §e${result.migrated}§a.`);
        playJobSound(player, 'success');
        return true;
    }

    getPlayerScore(player) {
        try {
            return getCurrencyScore(player);
        } catch (error) {
            console.error(error);
        }
        return 0;
    }

    addPlayerScore(player, amount) {
        return setScoreDelta(player, getActiveCurrencyObjectiveId(), amount);
    }

}


// ==========================================
// SALARY SYSTEM
// ==========================================

class SalarySystem {
    constructor(dataManager) {
        this.data = dataManager;
        this.runId = undefined;
        this.dayCount = 0;
        this.sync();
    }

    sync() {
        if (!CONFIG.ENABLE_DAILY_SALARY || !isJobsSystemEnabled()) {
            if (this.runId !== undefined) system.clearRun(this.runId);
            this.runId = undefined;
            return;
        }
        if (this.runId !== undefined) return;
        this.runId = system.runInterval(() => {
            if (!isJobsSystemEnabled()) {
                this.sync();
                return;
            }
            if (!this.data.hasActiveJobs()) return;
            this.dayCount++;
            const players = world.getAllPlayers();
            
            for (const player of players) {
                try {
                    const data = this.data.getPlayerData(player);
                    if (!data || data.jobs.size === 0) continue;
                    
                    let totalSalary = 0;
                    const breakdown = [];
                    
                    for (const jobId of data.jobs) {
                        const job = JOBS[jobId.toUpperCase()];
                        const level = data.level.get(jobId) || 1;
                        const salary = job.baseSalary * level;
                        totalSalary += salary;
                        breakdown.push(`${job.color}${jobNamePlain(player, job.id)} §a+${formatCurrencyAmount(salary)}`);
                    }
                    
                    if (totalSalary > 0) {
                        const payoutResult = applyConfiguredRewardPayouts(player, 'salary', {
                            computedAmount: totalSalary,
                            configuredAmount: totalSalary
                        });

                        data.totalEarnings += totalSalary;
                        data.lastSalary = totalSalary;
                        this.data.addHistoryEntry(player, {
                            type: 'salary',
                            title: 'Salary Payment',
                            detail: formatRewardSummary(payoutResult) || formatCurrencyAmount(totalSalary)
                        });
                        this.data.markDirty(player.id);
                        this.data.saveDataToStorage(player, data);

                        if (this.data.shouldNotify(player, 'salaryMessages')) {
                            player.sendMessage("§6----------------------------");
                            player.sendMessage(`§6§lSALARY PAYMENT §r§7(Day ${this.dayCount})`);
                            breakdown.forEach(line => player.sendMessage(`§7• ${line}`));
                            if (this.data.shouldNotify(player, 'rewardChat')) {
                                for (const line of getRewardLines(payoutResult)) player.sendMessage(line);
                            }
                            player.sendMessage(`§6Total Value: §a${formatCurrencyAmount(totalSalary)}`);
                            player.sendMessage("§6----------------------------");
                        }
                        playJobSound(player, 'salary');
                    }
                } catch (error) {
                    console.error(`[Jobs] Salary error for player:`, error);
                }
            }
        }, CONFIG.SALARY_INTERVAL_TICKS);
    }
}

function commandResult(success, message) {
    return {
        status: success ? CustomCommandStatus.Success : CustomCommandStatus.Failure,
        message
    };
}

function getCommandSourcePlayer(origin) {
    const source = origin?.initiator ?? origin?.sourceEntity;
    return source instanceof Player ? source : null;
}

function getSinglePlayerFromSelector(selectorValue) {
    if (selectorValue instanceof Player) return selectorValue;
    if (!Array.isArray(selectorValue) || selectorValue.length !== 1) return null;
    return selectorValue[0] instanceof Player ? selectorValue[0] : null;
}

function getJobsEventManager() {
    return ensureJobsSystem()?.events ?? null;
}

function normalizeCustomCommandArgs(firstArg, restArgs = []) {
    // Some Bedrock builds pass custom command parameters as one args array,
    // while others pass them as separate callback parameters. Support both so
    // string parameters like "coins" do not get truncated to "c".
    if (Array.isArray(firstArg) && restArgs.length === 0) return firstArg;
    if (firstArg === undefined && restArgs.length === 0) return [];
    return [firstArg, ...restArgs];
}

function registerJobsCommand(customCommandRegistry, definition, callback) {
    try {
        customCommandRegistry.registerCommand(definition, (origin, firstArg, ...restArgs) => {
            if (!isJobsSystemEnabled()) return commandResult(false, 'Jobs system is currently disabled.');
            return callback(origin, normalizeCustomCommandArgs(firstArg, restArgs));
        });
    } catch (error) {
        console.error(`[Jobs] Failed to register /${definition.name}:`, error);
    }
}

function registerJobsSlashCommands(customCommandRegistry) {
    try {
        customCommandRegistry.registerEnum('kiw:job_currency_mode', CURRENCY_MIGRATION_MODES);
    } catch (error) {
        console.error('[Jobs] Failed to register currency migration enum:', error);
    }


    registerJobsCommand(
        customCommandRegistry,
        {
            name: 'kiw:job_balance',
            description: 'Show your Jobs currency balance.',
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false
        },
        (origin) => {
            const player = getCommandSourcePlayer(origin);
            if (!player) return commandResult(false, 'This command can only be used by a player.');
            system.run(() => getJobsEventManager()?.handleBalanceCommand(player));
            return commandResult(true, 'Balance shown.');
        }
    );

    registerJobsCommand(
        customCommandRegistry,
        {
            name: 'kiw:job_pay',
            description: 'Pay Jobs currency to another online player.',
            permissionLevel: CommandPermissionLevel.Any,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.PlayerSelector, name: 'player' },
                { type: CustomCommandParamType.Integer, name: 'amount' }
            ]
        },
        (origin, args) => {
            const player = getCommandSourcePlayer(origin);
            if (!player) return commandResult(false, 'This command can only be used by a player.');
            const target = getSinglePlayerFromSelector(args?.[0]);
            const amount = parsePositiveCurrencyAmount(args?.[1]);
            if (!target) return commandResult(false, 'Select exactly one online player.');
            if (!amount) return commandResult(false, `Amount must be a positive whole number up to ${MAX_CURRENCY_TRANSACTION}.`);
            system.run(() => getJobsEventManager()?.payPlayer(player, target, amount, target.name));
            return commandResult(true, 'Payment requested.');
        }
    );

    registerJobsCommand(
        customCommandRegistry,
        {
            name: 'kiw:job_admingive',
            description: 'Admin: give Jobs currency to a player.',
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.PlayerSelector, name: 'player' },
                { type: CustomCommandParamType.Integer, name: 'amount' }
            ]
        },
        (origin, args) => {
            const player = getCommandSourcePlayer(origin);
            if (!player) return commandResult(false, 'This command can only be used by a player.');
            const target = getSinglePlayerFromSelector(args?.[0]);
            const amount = parsePositiveCurrencyAmount(args?.[1]);
            if (!target) return commandResult(false, 'Select exactly one online player.');
            if (!amount) return commandResult(false, `Amount must be a positive whole number up to ${MAX_CURRENCY_TRANSACTION}.`);
            system.run(() => getJobsEventManager()?.adminGive(player, target, amount, target.name));
            return commandResult(true, 'Admin give requested.');
        }
    );

    registerJobsCommand(
        customCommandRegistry,
        {
            name: 'kiw:job_admintake',
            description: 'Admin: take Jobs currency from a player.',
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.PlayerSelector, name: 'player' },
                { type: CustomCommandParamType.Integer, name: 'amount' }
            ]
        },
        (origin, args) => {
            const player = getCommandSourcePlayer(origin);
            if (!player) return commandResult(false, 'This command can only be used by a player.');
            const target = getSinglePlayerFromSelector(args?.[0]);
            const amount = parsePositiveCurrencyAmount(args?.[1]);
            if (!target) return commandResult(false, 'Select exactly one online player.');
            if (!amount) return commandResult(false, `Amount must be a positive whole number up to ${MAX_CURRENCY_TRANSACTION}.`);
            system.run(() => getJobsEventManager()?.adminTake(player, target, amount, target.name));
            return commandResult(true, 'Admin take requested.');
        }
    );

    registerJobsCommand(
        customCommandRegistry,
        {
            name: 'kiw:job_adminreset',
            description: 'Admin: reset a player\'s Jobs data.',
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.PlayerSelector, name: 'player' }
            ]
        },
        (origin, args) => {
            const player = getCommandSourcePlayer(origin);
            if (!player) return commandResult(false, 'This command can only be used by a player.');
            const target = getSinglePlayerFromSelector(args?.[0]);
            if (!target) return commandResult(false, 'Select exactly one online player.');
            system.run(() => getJobsEventManager()?.adminReset(player, target, target.name));
            return commandResult(true, 'Admin reset requested.');
        }
    );

    registerJobsCommand(
        customCommandRegistry,
        {
            name: 'kiw:job_adminsave',
            description: 'Admin: save all dirty Jobs player data.',
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false
        },
        (origin) => {
            const player = getCommandSourcePlayer(origin);
            if (!player) return commandResult(false, 'This command can only be used by a player.');
            system.run(() => getJobsEventManager()?.adminSave(player));
            return commandResult(true, 'Admin save requested.');
        }
    );

    registerJobsCommand(
        customCommandRegistry,
        {
            name: 'kiw:job_currency',
            description: 'Admin: change the Jobs currency scoreboard objective.',
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [
                { type: CustomCommandParamType.String, name: 'objective' }
            ],
            optionalParameters: [
                { type: CustomCommandParamType.Enum, name: 'kiw:job_currency_mode' }
            ]
        },
        (origin, args) => {
            const player = getCommandSourcePlayer(origin);
            if (!player) return commandResult(false, 'This command can only be used by a player.');
            const objectiveId = String(args?.[0] ?? '').trim();
            const mode = String(args?.[1] ?? 'copy').trim().toLowerCase();
            const validation = validateScoreboardObjectiveId(objectiveId);
            if (!validation.ok) return commandResult(false, validation.reason);
            system.run(() => getJobsEventManager()?.adminSetCurrency(player, validation.id, mode));
            return commandResult(true, 'Currency change requested.');
        }
    );
}

if (system.beforeEvents?.startup) {
    system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
        registerJobsSlashCommands(customCommandRegistry);
    });
} else {
    console.warn('[Jobs] Custom slash commands are unavailable in this @minecraft/server version; legacy chat commands remain enabled.');
}


// ==========================================
// MAIN SYSTEM
// ==========================================

class JobsSystem {
    syncFeatureState() {
        this.data?.syncPeriodicTasks();
        this.salary?.sync();
        this.startFeatureWatch();
    }

    startFeatureWatch() {
        if (this.featureWatchRunId !== undefined) return;
        this.featureWatchRunId = system.runInterval(() => this.syncFeatureState(), 200);
    }

    stopFeatureWatch() {
        if (this.featureWatchRunId === undefined) return;
        system.clearRun(this.featureWatchRunId);
        this.featureWatchRunId = undefined;
    }

    constructor() {
        this.featureWatchRunId = undefined;
        // System initialization wrapped in system.run to fully prevent early execution issues.
        system.run(() => {
            console.log("[Jobs] Initializing Advanced Jobs System v5.3.0...");
            
            this.data = new DataManager();
            this.gui = new JobGUI(this.data);
            this.events = new EventManager(this.data, this.gui);
            this.salary = new SalarySystem(this.data);
            this.syncFeatureState();
            
            // displayWelcome() chat broadcast removed
            
            console.log("[Jobs] System initialized successfully!");
        });
    }
    
    displayWelcome() {
        // Chat broadcast on load removed (avoids server-wide spam).
    }
}

system.run(() => {
    ensureJobsSystem();
});

// Export for external use
export { openJobsMenu, jobsSystem, JOBS, CONFIG, REWARDS, QUESTS, ACHIEVEMENTS };
