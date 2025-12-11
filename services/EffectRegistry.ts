import { EffectPlugin } from '../types';
import { FilterDesertPlugin } from '../plugins/FilterDesertPlugin';
import { TremoloDesertPlugin } from '../plugins/TremoloDesertPlugin';

class EffectRegistryService {
  private plugins: Map<string, EffectPlugin> = new Map();

  constructor() {
    this.loadPlugins();
  }

  private loadPlugins() {
    // Registro manual dos plugins para garantir compatibilidade e evitar erros com import.meta.glob
    this.register(FilterDesertPlugin);
    this.register(TremoloDesertPlugin);
  }

  register(plugin: EffectPlugin) {
    if (this.plugins.has(plugin.id)) {
        console.warn(`[EffectRegistry] Duplicate plugin ID ignored: ${plugin.id}`);
        return;
    }
    this.plugins.set(plugin.id, plugin);
    console.log(`[EffectRegistry] Registered: ${plugin.name}`);
  }

  get(id: string): EffectPlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): EffectPlugin[] {
    return Array.from(this.plugins.values());
  }

  // Retorna um objeto com as configurações padrão de todos os plugins carregados
  getDefaultSettings(): Record<string, any> {
    const settings: Record<string, any> = {};
    this.plugins.forEach(plugin => {
      settings[plugin.id] = { ...plugin.defaultSettings };
    });
    return settings;
  }
}

export const EffectRegistry = new EffectRegistryService();