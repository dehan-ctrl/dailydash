export function createPickerState(meal, overrides = {}) {
  return {
    meal, tab: 'recent', q: '', searchPage: 1, hasMore: false, results: [], searching: false,
    locals: null, picked: null, editEntry: null, editing: false, subform: null, recipeDraft: null,
    msg: '', scanning: false, searchMode: false,
    ...overrides,
  };
}
