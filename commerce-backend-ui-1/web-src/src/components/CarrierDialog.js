import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, Heading, Divider, Content, ButtonGroup, Button,
  Form, TextField, NumberField, Picker, Item, Checkbox,
  Flex, Grid, View, Text, ListBox
} from '@adobe/react-spectrum';

const ADD_CARRIER_URL  = '/api/v1/web/FulcrumCustomShippingMenu/add-carrier';
const GET_GROUPS_URL   = '/api/v1/web/FulcrumCustomShippingMenu/get-customer-groups';
const GET_CARRIERS_URL = '/api/v1/web/FulcrumCustomShippingMenu/get-carriers';
const GET_STORES_URL   = '/api/v1/web/FulcrumCustomShippingMenu/get-stores';

export function CarrierDialog({
  initialData,
  allStores = [],
  allCountries = [],
  onClose,
  onSuccess,
  mode = 'add'
}) {
  const getDefaultStore = () =>
    (allStores.find(s => s.id === 'default') ? 'default' : (allStores[0]?.id ?? 'default'));

  const [form, setForm] = useState(() => {
    const storesArr    = Array.isArray(initialData?.stores) ? initialData.stores : [];
    const countriesArr = Array.isArray(initialData?.countries) ? initialData.countries : [];
    return {
      code: (initialData?.code ?? '').toString(),
      title: (initialData?.title ?? '').toString(),
      stores: (storesArr.length ? storesArr.map(String) : [initialData?.store ?? getDefaultStore()].filter(Boolean).map(String)),
      countries: countriesArr.length ? countriesArr.map(String) : [],
      sort_order: (mode === 'edit' && Number.isInteger(initialData?.sort_order))
        ? String(initialData.sort_order)
        : '',
      active: !!initialData?.active,
      price_per_item: !!initialData?.price_per_item,
      tracking_available: !!initialData?.tracking_available,
      shipping_labels_available: !!initialData?.shipping_labels_available,
      method_name: initialData?.method_name ?? '',
      value: (typeof initialData?.value === 'number') ? initialData.value : null,
      minimum: (typeof initialData?.minimum === 'number') ? initialData.minimum : null,
      maximum: (typeof initialData?.maximum === 'number') ? initialData.maximum : null,
      customer_groups: Array.isArray(initialData?.customer_groups)
        ? initialData.customer_groups.map(String) : []
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupOptions, setGroupOptions]   = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setGroupsLoading(true);
        const res = await fetch(GET_GROUPS_URL);
        const json = await res.json();
        const items = Array.isArray(json.items) ? json.items : [];
        if (!alive) return;
        setGroupOptions(items.map(g => ({ id: String(g.id), label: g.code || `Group ${g.id}` })));
      } catch (e) {
        if (!alive) return;
        setError(`Error loading customer groups: ${e.message}`);
      } finally {
        if (alive) setGroupsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const [storesLoading, setStoresLoading] = useState(true);
  const [storeOptions, setStoreOptions]   = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStoresLoading(true);
        let items = [];
        try {
          const res = await fetch(GET_STORES_URL);
          const json = await res.json();
          items = Array.isArray(json.items) ? json.items : [];
        } catch {
          items = Array.isArray(allStores) ? allStores : [];
        }
        if (!alive) return;

        const normalized = items
          .map(s => {
            const code = String(s.code ?? s.id ?? '').trim();
            if (!code) return null;
            return { id: code, name: s.name ?? code };
          })
          .filter(Boolean);

        setStoreOptions(normalized);
      } catch (e) {
        if (!alive) return;
        setError(prev => prev || `Error loading stores: ${e.message}`);
      } finally {
        if (alive) setStoresLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [allStores]);

  const allStoresResolved = useMemo(() => {
    if (storeOptions.length) return storeOptions;
    return (Array.isArray(allStores) ? allStores.map(s => ({ id: String(s.id), name: s.name ?? String(s.id) })) : []);
  }, [storeOptions, allStores]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (mode !== 'edit' || !initialData?.code) return;
      try {
        const res = await fetch(GET_CARRIERS_URL);
        const json = await res.json();
        const items = Array.isArray(json?.carriers) ? json.carriers : [];
        const me = items.find(x => String(x.code) === String(initialData.code));
        if (!alive || !me) return;

        setForm(prev => ({
          ...prev,
          method_name: me.method_name ?? prev.method_name ?? '',
          value: (typeof me.value === 'number') ? me.value : prev.value,
          minimum: (typeof me.minimum === 'number') ? me.minimum : prev.minimum,
          maximum: (typeof me.maximum === 'number') ? me.maximum : prev.maximum,
          customer_groups: Array.isArray(me.customer_groups) ? me.customer_groups.map(String) : prev.customer_groups,
          stores: (prev.stores && prev.stores.length) ? prev.stores : (Array.isArray(me.stores) ? me.stores.map(String) : prev.stores),
          countries: (prev.countries && prev.countries.length)
            ? prev.countries
            : (Array.isArray(me.countries) ? me.countries.map(String) : prev.countries)
        }));
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [mode, initialData?.code]);

  useEffect(() => {
    if (mode === 'add' && !groupsLoading && groupOptions.length && (!form.customer_groups || form.customer_groups.length === 0)) {
      setForm(prev => ({
        ...prev,
        customer_groups: groupOptions.slice(0, 2).map(o => o.id)
      }));
    }
  }, [groupsLoading, groupOptions, mode]);

  const onChange = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const groupsSelected = (form.customer_groups && form.customer_groups.length > 0);
  const validSortOrder = (form.sort_order === '' || /^\d+$/.test(form.sort_order));

  const canSave = useMemo(() => {
    if (!form.code?.trim() || !form.title?.trim()) return false;
    if (!validSortOrder) return false;
    if (!groupsSelected) return false;
    return true;
  }, [form, validSortOrder, groupsSelected]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');

      const storesArr    = (form.stores || []).map(String).filter(Boolean);
      const countriesArr = (form.countries || []).map(String).filter(Boolean);

      const sortOrderEmpty  = form.sort_order === '';
      const sortOrderNumber = /^\d+$/.test(form.sort_order) ? Number(form.sort_order) : NaN;

      const native = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        code: String(form.code).trim(),
        title: String(form.title).trim(),
        stores: storesArr,
        countries: countriesArr,
        ...(sortOrderEmpty ? { sort_order: null } : Number.isInteger(sortOrderNumber) ? { sort_order: sortOrderNumber } : {}),
        active: !!form.active,
        tracking_available: !!form.tracking_available,
        shipping_labels_available: !!form.shipping_labels_available
      };

      const variables = {
        __clear_sort_order: sortOrderEmpty || undefined,
        method_name: form.method_name ?? '',
        value: (typeof form.value === 'number') ? form.value : null,
        minimum: (typeof form.minimum === 'number') ? form.minimum : null,
        maximum: (typeof form.maximum === 'number') ? form.maximum : null,
        customer_groups: (form.customer_groups || []).map(v => Number(v)).filter(n => Number.isInteger(n)),
        ...(typeof form.price_per_item === 'boolean' ? { price_per_item: form.price_per_item } : {})
      };

      const payload = { ...native, variables };

      const res = await fetch(ADD_CARRIER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: payload })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to save carrier');

      onSuccess && onSuccess(json);
      onClose && onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog>
      <Heading>{mode === 'edit' ? 'Edit Carrier' : 'Add Carrier'}</Heading>
      <Divider />
      <Content>
        <Form maxWidth="100%">
          <Grid columns={['1fr', '1fr']} gap="size-200" alignItems="end">
            <TextField
              label="Code *"
              value={form.code}
              onChange={(v) => onChange({ code: v })}
              isDisabled={mode === 'edit'}
            />
            <TextField
              label="Title *"
              value={form.title}
              onChange={(v) => onChange({ title: v })}
            />

            <TextField
              label="Method Name"
              value={form.method_name || ''}
              onChange={(v) => onChange({ method_name: v })}
            />

            <View>
              <Text UNSAFE_style={{ fontWeight: 600 }}>Stores</Text>
              <ListBox
                aria-label="Stores"
                selectionMode="multiple"
                selectedKeys={new Set(form.stores || [])}
                onSelectionChange={(keys) => {
                  const arr = Array.from(keys || []).map(String);
                  onChange({ stores: arr });
                }}
                width="100%"
                UNSAFE_style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--spectrum-alias-border-color)' }}
              >
                {allStoresResolved.map(s => (
                  <Item key={String(s.id)}>{s.name ?? s.id}</Item>
                ))}
              </ListBox>
              {storesLoading && <View marginTop="size-100">Loading stores…</View>}
            </View>
          </Grid>

          <Flex gap="size-300" marginTop="size-200" alignItems="center" wrap>
            <NumberField
              label="Price"
              hideStepper
              value={form.value}
              onChange={(v) => onChange({ value: Number.isFinite(v) ? v : null })}
              width="size-1000"
            />
            <NumberField
              label="Minimum"
              hideStepper
              value={form.minimum}
              onChange={(v) => onChange({ minimum: Number.isFinite(v) ? v : null })}
              width="size-1000"
            />
            <NumberField
              label="Maximum"
              hideStepper
              value={form.maximum}
              onChange={(v) => onChange({ maximum: Number.isFinite(v) ? v : null })}
              width="size-1000"
            />
            <TextField
              label="Sort order"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(v) => {
                const raw = String(v);
                if (/^\d*$/.test(raw)) onChange({ sort_order: raw });
              }}
              width="size-1000"
            />
            <Checkbox
              isSelected={form.price_per_item}
              onChange={(v) => onChange({ price_per_item: v })}
            >
              Price per item
            </Checkbox>
          </Flex>

          <Flex gap="size-300" marginTop="size-200" alignItems="center">
            <Checkbox
              isSelected={form.active}
              onChange={(v) => onChange({ active: v })}
            >
              Active
            </Checkbox>
            <Checkbox
              isSelected={form.tracking_available}
              onChange={(v) => onChange({ tracking_available: v })}
            >
              Tracking available
            </Checkbox>
            <Checkbox
              isSelected={form.shipping_labels_available}
              onChange={(v) => onChange({ shipping_labels_available: v })}
            >
              Shipping labels available
            </Checkbox>
          </Flex>

          {/* Customer Groups */}
          <View marginTop="size-300">
            <Text UNSAFE_style={{ fontWeight: 600 }}>Customer Groups</Text>
            <ListBox
              aria-label="Customer groups"
              selectionMode="multiple"
              selectedKeys={new Set(form.customer_groups)}
              onSelectionChange={(keys) => {
                const arr = Array.from(keys || []).map(String);
                onChange({ customer_groups: arr });
              }}
              width="size-6000"
              UNSAFE_style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--spectrum-alias-border-color)' }}
            >
              {groupOptions.map(opt => (
                <Item key={opt.id}>{opt.label}</Item>
              ))}
            </ListBox>
            {!groupsSelected && (
              <View marginTop="size-100" UNSAFE_style={{ color: 'crimson' }}>
                Select at least one customer group.
              </View>
            )}
            {groupsLoading && <View marginTop="size-100">Loading groups…</View>}
          </View>

          {error && (
            <View marginTop="size-200" UNSAFE_style={{ color: 'crimson' }}>
              {error}
            </View>
          )}
        </Form>
      </Content>
      <ButtonGroup>
        <Button variant="secondary" onPress={onClose}>Cancel</Button>
        <Button variant="cta" isDisabled={saving || !canSave} onPress={handleSave}>
          {saving ? 'Saving…' : (mode === 'edit' ? 'Save' : 'Add')}
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}

export default CarrierDialog;