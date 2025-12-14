import { EffectPlugin } from '../types';
import { FilterDesertPlugin } from '../plugins/FilterDesertPlugin';
import { TremoloDesertPlugin } from '../plugins/TremoloDesertPlugin';
import { PocketCompPlugin, PocketEQPlugin, PocketDrivePlugin, PocketSpacePlugin, PocketGatePlugin } from '../plugins/MobileSuite';

class EffectRegistryService {
  private plugins: Map<string, EffectPlugin> = new Map();

  constructor() {
    this.loadPlugins();
  }

  private loadPlugins() {
    // Standard Plugins
    this.register(FilterDesertPlugin);
    this.register(TremoloDesertPlugin);
    
    // Pocket Series (Mobile Optimized)
    this.register(PocketCompPlugin);
    this.register(PocketEQPlugin);
    this.register(PocketDrivePlugin);
    this.register(PocketSpacePlugin);
    this.register(PocketGatePlugin);
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