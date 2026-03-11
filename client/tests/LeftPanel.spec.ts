import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import LeftPanel from '@/components/LeftPanel.vue';
import { api, pendingItems } from '@/composables/useApi';

vi.mock('@/composables/useApi', () => ({
  api: {
    getItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    selectItem: vi.fn(),
    addItem: vi.fn().mockResolvedValue({ added: true, deduplicated: false }),
  },
  pendingItems: { value: new Map() },
}));

describe('LeftPanel.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (api.getItems as jest.Mock).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshWithHighlight reloads and highlights returned item', async () => {
    const wrapper = mount(LeftPanel);
    // stub getItems to return an array containing the highlight id
    (api.getItems as any).mockResolvedValue({ items: [{ id: 'foo' }], total: 1 });

    await wrapper.vm.refreshWithHighlight('foo');
    await nextTick();

    expect(api.getItems).toHaveBeenCalledWith(0, 20, undefined);
    const row = wrapper.find('.item-row');
    expect(row.classes()).toContain('item-row--arrived');

    // after animation timeout it should clear
    vi.advanceTimersByTime(1200);
    await nextTick();
    expect(wrapper.find('.item-row').classes()).not.toContain('item-row--arrived');
  });

  it('does not highlight if item not in list', async () => {
    const wrapper = mount(LeftPanel);
    (api.getItems as any).mockResolvedValue({ items: [{ id: 'bar' }], total: 1 });

    await wrapper.vm.refreshWithHighlight('foo');
    await nextTick();

    expect(wrapper.find('.item-row').classes()).not.toContain('item-row--arrived');
  });

  it('counter pulses when total changes', async () => {
    const wrapper = mount(LeftPanel);
    wrapper.vm.total = 2;
    await nextTick();
    expect(wrapper.find('.count').classes()).toContain('count--pulse');
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(wrapper.find('.count').classes()).not.toContain('count--pulse');
  });

  it('emits item-selected event with id', async () => {
    const wrapper = mount(LeftPanel);
    wrapper.vm.items = [{ id: 'foo' }];
    wrapper.vm.total = 1;
    await nextTick();

    wrapper.vm.selectItem('foo');
    expect(wrapper.emitted('item-selected')).toBeTruthy();
    expect(wrapper.emitted('item-selected')![0]).toEqual(['foo']);
  });

  it('selectItem adds id to departingIds, waits then removes', async () => {
    const wrapper = mount(LeftPanel);
    wrapper.vm.items = [{ id: 'foo' }, { id: 'bar' }];
    wrapper.vm.total = 2;
    await nextTick();

    const removal = wrapper.vm.selectItem('foo');
    expect(wrapper.vm.departingIds.has('foo')).toBe(true);
    expect(wrapper.vm.total).toBe(1);
    vi.advanceTimersByTime(300);
    await removal;
    expect(wrapper.vm.items.find(i => i.id === 'foo')).toBeUndefined();
    expect(wrapper.vm.departingIds.has('foo')).toBe(false);
  });

  it('animation class is added when selecting', async () => {
    const wrapper = mount(LeftPanel);
    wrapper.vm.items = [{ id: 'xyz' }];
    await nextTick();

    wrapper.vm.selectItem('xyz');
    await nextTick();
    expect(wrapper.find('.item-row').classes()).toContain('departing');
  });
});