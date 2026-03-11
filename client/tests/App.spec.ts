import { mount } from '@vue/test-utils';
import App from '@/App.vue';
import RightPanel from '@/components/RightPanel.vue';
import LeftPanel from '@/components/LeftPanel.vue';

describe('App.vue', () => {
  it('forwards item-deselected event to left panel with ID', async () => {
    const wrapper = mount(App, {
      global: {
        components: { LeftPanel, RightPanel },
      },
    });

    // make sure leftPanelRef is assigned
    expect(wrapper.vm.leftPanelRef).not.toBe(null);
    const left = wrapper.vm.leftPanelRef as any;
    // spy on the exposed method
    const spy = vi.spyOn(left, 'refreshWithHighlight');

    const right = wrapper.findComponent(RightPanel);
    right.vm.$emit('item-deselected', 'xyz');

    expect(spy).toHaveBeenCalledWith('xyz');
  });

  it('forwards item-selected with id to right panel', async () => {
    const wrapper = mount(App, {
      global: {
        components: { LeftPanel, RightPanel },
      },
    });

    const right = wrapper.findComponent(RightPanel);
    const spyRight = vi.spyOn(right.vm, 'refreshWithHighlight');

    const left = wrapper.findComponent(LeftPanel);
    left.vm.$emit('item-selected', 'abc');

    expect(spyRight).toHaveBeenCalledWith('abc');
  });
});