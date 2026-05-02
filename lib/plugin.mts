import type compromise from 'compromise';
import dictionary from './fwn-data.mts';

export function lookup(word: keyof typeof dictionary): any {
  return dictionary[word] ?? [];
}

export type FwnPlugin = {
  fwnDefinitions: () => Record<string, any>;
};

const plugin: compromise.TypedPlugin<object> = {
  methods: {},
  api(View: any) {
    View.prototype.fwnDefinitions = function () {
      const out: Record<string, any> = {};
      this.terms().forEach((term: any) => {
        const text = term.text({ keepPunct: false }).trim();
        if (!text) return;
        out[text] = lookup(text);
      });
      return out;
    };
  },
};

export default plugin;
