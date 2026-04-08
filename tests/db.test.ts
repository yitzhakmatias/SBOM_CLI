import { createStore, addDocument, SBOMDocument } from '../src/db';

const makeDoc = (filename: string, id = 'id-1'): SBOMDocument => ({
  id,
  filename,
  format: 'cyclonedx',
  components: [{ name: 'express', version: '4.18.2', licenses: ['MIT'] }],
});

describe('createStore', () => {
  it('returns an empty store', () => {
    const store = createStore();
    expect(store.documents).toHaveLength(0);
  });
});

describe('addDocument', () => {
  it('adds a new document and returns "added"', () => {
    const store = createStore();
    expect(addDocument(store, makeDoc('app.json'))).toBe('added');
    expect(store.documents).toHaveLength(1);
  });

  it('replaces an existing document with the same filename and returns "updated"', () => {
    const store = createStore();
    addDocument(store, makeDoc('app.json', 'old-id'));
    const result = addDocument(store, makeDoc('app.json', 'new-id'));
    expect(result).toBe('updated');
    expect(store.documents).toHaveLength(1);
    expect(store.documents[0].id).toBe('new-id');
  });

  it('keeps separate documents with different filenames', () => {
    const store = createStore();
    addDocument(store, makeDoc('a.json'));
    addDocument(store, makeDoc('b.json'));
    expect(store.documents).toHaveLength(2);
  });

  it('preserves document data after add', () => {
    const store = createStore();
    const doc = makeDoc('app.json');
    addDocument(store, doc);
    expect(store.documents[0]).toEqual(doc);
  });
});
