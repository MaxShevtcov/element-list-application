import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import RightPanel from '@/components/RightPanel.vue';
import { api } from '@/composables/useApi';

// mock the API module so we can observe calls and control behavior
vi.mock('@/composables/useApi', () => ({
  api: {
    deselectItem: vi.fn(),
    getSelected: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  },
}));

describe('RightPanel.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (api.deselectItem as jest.Mock).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deselectItem adds id to departingIds, waits then removes item', async () => {
    const wrapper = mount(RightPanel);
    // start with a pair of items
    wrapper.vm.items = [{ id: 'foo' }, { id: 'bar' }];
    wrapper.vm.total = 2;
    await nextTick();

    const removal = wrapper.vm.deselectItem('foo');

    // optimistic updates should happen synchronously
    expect(wrapper.vm.departingIds.has('foo')).toBe(true);
    expect(wrapper.vm.total).toBe(1);

    // advance the 300ms delay and wait for the promise to resolve
    vi.advanceTimersByTime(300);
    await removal;

    expect(wrapper.vm.items.find((i) => i.id === 'foo')).toBeUndefined();
    expect(wrapper.vm.departingIds.has('foo')).toBe(false);
    expect(wrapper.vm.total).toBe(1);
  });

  it('animation class is added to departing item row', async () => {
    const wrapper = mount(RightPanel);
    wrapper.vm.items = [{ id: 'xyz' }];
    await nextTick();

    wrapper.vm.deselectItem('xyz');
    await nextTick();

    const row = wrapper.find('.item-row');
    expect(row.classes()).toContain('departing');
  });

  it('total updates immediately and remains correct after removal', async () => {
    const wrapper = mount(RightPanel);
    wrapper.vm.items = [{ id: 'one' }, { id: 'two' }];
    wrapper.vm.total = 2;
    await nextTick();

    const removal = wrapper.vm.deselectItem('one');
    expect(wrapper.vm.total).toBe(1);

    vi.advanceTimersByTime(300);
    await removal;

    // ensure the count shown in the DOM matches
    const printed = wrapper.find('.count').text();
    expect(printed).toContain('1');
  });

  it('api.deselectItem is called and errors trigger reload', async () => {
    const wrapper = mount(RightPanel);
    wrapper.vm.items = [{ id: 'zzz' }];
    wrapper.vm.total = 1;
    await nextTick();

    const loadSpy = vi.spyOn(wrapper.vm, 'loadItems').mockResolvedValue();
    (api.deselectItem as any).mockRejectedValue(new Error('boom'));

    const removal = wrapper.vm.deselectItem('zzz');
    expect(api.deselectItem).toHaveBeenCalledWith('zzz');

    // advance timers so removal happens
    vi.advanceTimersByTime(300);
    await removal;

    expect(loadSpy).toHaveBeenCalledWith(true);
  });

  it('emits item-deselected event with id', async () => {
    const wrapper = mount(RightPanel);
    wrapper.vm.items = [{ id: 'abc' }];
    wrapper.vm.total = 1;
    await nextTick();

    wrapper.vm.deselectItem('abc');
    // event is emitted synchronously
    expect(wrapper.emitted('item-deselected')).toBeTruthy();
    expect(wrapper.emitted('item-deselected')![0]).toEqual(['abc']);
  });

  it('counter pulses when total changes', async () => {
    const wrapper = mount(RightPanel);
    wrapper.vm.total = 5;
    await nextTick();
    expect(wrapper.find('.count').classes()).toContain('count--pulse');
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(wrapper.find('.count').classes()).not.toContain('count--pulse');
  });

  it('refreshWithHighlight reloads and highlights returned item', async () => {
    const wrapper = mount(RightPanel);
    (api.getSelected as any).mockResolvedValue({ items: [{ id: 'bar' }], total: 1 });

    await wrapper.vm.refreshWithHighlight('bar');
    await nextTick();
    expect(api.getSelected).toHaveBeenCalledWith(0, 20, undefined);
    const row = wrapper.find('.item-row');
    expect(row.classes()).toContain('item-row--arrived');
    vi.advanceTimersByTime(1200);
    await nextTick();
    expect(wrapper.find('.item-row').classes()).not.toContain('item-row--arrived');
  });
});