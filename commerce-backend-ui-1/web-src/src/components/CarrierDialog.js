import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, Heading, Divider, Content, ButtonGroup, Button,
  Form, TextField, NumberField, Checkbox,
  Flex, Grid, View, Text, ListBox, Item
} from '@adobe/react-spectrum';

const ADD_CARRIER_URL  = '/api/v1/web/FulcrumCustomShippingMenu/add-carrier';
const GET_GROUPS_URL   = '/api/v1/web/FulcrumCustomShippingMenu/get-customer-groups';
const GET_CARRIERS_URL = '/api/v1/web/FulcrumCustomShippingMenu/get-carriers';
const GET_STORES_URL   = '/api/v1/web/FulcrumCustomShippingMenu/get-stores';

function CarrierDialog({
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
    const storesArr = Array.isArray(initialData?.stores) ? initialData.stores : [];
    return {
      code: initialData?.code ?? '',
      title: initialData?.title ?? '',
      stores: (storesArr.length ? storesArr : [initialData?.store ?? getDefaultStore()]).filter(Boolean),
      sort_order: (mode === 'edit' && Number.isInteger(initialData?.sort_order))
        ? String(initialData.sort_order) : '',
      active: !!initialData?.active,
      price_per_item: !!initialData?.price_per_item,
      tracking_available: !!initialData?.tracking_available,
      shipping_labels_available: !!initialData?.shipping_labels_available,
      method_name: initialData?.method_name ?? '',
      value: typeof initialData?.value === 'number' ? initialData.value : null,
      minimum: typeof initialData?.minimum === 'number' ? initialData.minimum : null,
      maximum: typeof initialData?.maximum === 'number' ? initialData.maximum : null,
      customer_groups: Array.isArray(initialData?.customer_groups)
        ? initialData.customer_groups.map(String) : []
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [carriers, setCarriers] = useState([]);

  const [groupOptions, setGroupOptions] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [storeOptions, setStoreOptions] = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);

  // Load carriers once for code validation
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(GET_CARRIERS_URL);
        const json = await res.json();
        if (alive) setCarriers(Array.isArray(json?.carriers) ? json.carriers : []);
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
  }, []);

  // Load customer groups
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setGroupsLoading(true);
        const res = await fetch(GET_GROUPS_URL);
        const json = await res.json();
        if (alive) {
          const items = Array.isArray(json.items) ? json.items : [];
          setGroupOptions(items.map(g => ({ id: String(g.id), label: g.code || `Group ${g.id}` })));
        }
      } catch (e) {
        if (alive) setError(`Error loading customer groups: ${e.message}`);
      } finally {
        if (alive) setGroupsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load stores
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
            return code ? { id: code, name: s.name ?? code } : null;
          })
          .filter(Boolean);
        setStoreOptions(normalized);
      } catch (e) {
        if (alive) setError(prev => prev || `Error loading stores: ${e.message}`);
      } finally {
        if (alive) setStoresLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [allStores]);

  const allStoresResolved = storeOptions.length
    ? storeOptions
    : allStores.map(s => ({ id: String(s.id), name: s.name ?? String(s.id) }));

  // Auto-select first two groups on "add"
  useEffect(() => {
    if (mode === 'add' && !groupsLoading && groupOptions.length && !form.customer_groups.length) {
      setForm(prev => ({ ...prev, customer_groups: groupOptions.slice(0, 2).map(o => o.id) }));
    }
  }, [mode, groupsLoading, groupOptions]);

  const onChange = patch => setForm(prev => ({ ...prev, ...patch }));
  const groupsSelected = form.customer_groups && form.customer_groups.length > 0;
  const storesSelected = form.stores && form.stores.length > 0;
  const validSortOrder = form.sort_order === '' || /^\d+$/.test(form.sort_order);

  // Inline validation for Code field
  const validateCode = value => {
    if (!value.trim()) return setCodeError('Code is required');
    if (mode === 'edit' && value === initialData?.code) return setCodeError('');
    const exists = carriers.some(c => String(c.code).toLowerCase() === value.toLowerCase());
    setCodeError(exists ? 'This code is already in use' : '');
  };

  const canSave =
    !!form.code.trim() &&
    !!form.title.trim() &&
    !codeError &&
    validSortOrder &&
    groupsSelected &&
    storesSelected;

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      const storesArr = form.stores.map(String).filter(Boolean);
      const sortOrderEmpty = form.sort_order === '';
      const sortOrderNumber = /^\d+$/.test(form.sort_order) ? Number(form.sort_order) : NaN;

      const native = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        code: form.code.trim(),
        title: form.title.trim(),
        stores: storesArr,
        ...(sortOrderEmpty ? { sort_order: null } : Number.isInteger(sortOrderNumber) ? { sort_order: sortOrderNumber } : {}),
        active: !!form.active,
        tracking_available: !!form.tracking_available,
        shipping_labels_available: !!form.shipping_labels_available
      };

      const variables = {
        method_name: form.method_name ?? '',
        value: typeof form.value === 'number' ? form.value : null,
        minimum: typeof form.minimum === 'number' ? form.minimum : null,
        maximum: typeof form.maximum === 'number' ? form.maximum : null,
        customer_groups: form.customer_groups.map(Number).filter(n => Number.isInteger(n)),
        ...(typeof form.price_per_item === 'boolean' ? { price_per_item: form.price_per_item } : {})
      };

      const res = await fetch(ADD_CARRIER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: { ...native, variables } })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'Failed to save carrier');
      onSuccess?.(json);
      onClose?.();
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
          <Grid columns={['1fr','1fr']} gap="size-200" alignItems="start">
            <TextField
              label="Code *"
              value={form.code}
              onChange={v => { onChange({ code: v }); setCodeError(''); }}
              onBlur={() => validateCode(form.code)}
              validationState={codeError ? 'invalid' : undefined}
              errorMessage={codeError}
              isDisabled={mode === 'edit'}
              width="100%"
            />
            <TextField
              label="Title *"
              value={form.title}
              onChange={v => onChange({ title: v })}
              width="100%"
            />
          </Grid>

          <Grid columns={['1fr','1fr']} gap="size-200" alignItems="start" marginTop="size-200">
            <TextField
              label="Method Name"
              value={form.method_name}
              onChange={v => onChange({ method_name: v })}
              width="100%"
            />
            <View>
              <Text
                UNSAFE_className="spectrum-FieldLabel spectrum-FieldLabel--sizeS"
                UNSAFE_style={{ display: 'block', marginBottom: 4, fontWeight: 400, fontSize: '0.9em' }}
              >
                Stores *
              </Text>
              <ListBox
                aria-label="Stores"
                selectionMode="multiple"
                selectedKeys={new Set(form.stores)}
                onSelectionChange={keys => onChange({ stores: Array.from(keys).map(String) })}
                width="100%"
                UNSAFE_style={{ maxHeight:160, overflow:'auto', border:'1px solid var(--spectrum-alias-border-color)' }}
              >
                {allStoresResolved.map(s => (
                  <Item key={s.id}>{s.name}</Item>
                ))}
              </ListBox>
              {!storesSelected && (
                <View marginTop="size-100" UNSAFE_style={{ color: 'crimson' }}>
                  Select at least one store.
                </View>
              )}
              {storesLoading && <View marginTop="size-100">Loading stores…</View>}
            </View>
          </Grid>

          <Flex gap="size-300" marginTop="size-200" alignItems="center" wrap>
            <NumberField label="Price" hideStepper value={form.value}
              onChange={v => onChange({ value: Number.isFinite(v) ? v : null })}
              width="size-1000" />
            <NumberField label="Minimum" hideStepper value={form.minimum}
              onChange={v => onChange({ minimum: Number.isFinite(v) ? v : null })}
              width="size-1000" />
            <NumberField label="Maximum" hideStepper value={form.maximum}
              onChange={v => onChange({ maximum: Number.isFinite(v) ? v : null })}
              width="size-1000" />
            <TextField label="Sort order" inputMode="numeric" value={form.sort_order}
              onChange={v => /^\d*$/.test(String(v)) && onChange({ sort_order: v })}
              width="size-1000" />
            <Checkbox
              isSelected={form.price_per_item}
              onChange={v => onChange({ price_per_item: v })}
            >
              <Text UNSAFE_className="spectrum-FieldLabel spectrum-FieldLabel--sizeS" UNSAFE_style={{ fontWeight: 400, fontSize: '0.9em' }}>
                Price per item
              </Text>
            </Checkbox>
          </Flex>

          <Flex gap="size-300" marginTop="size-200" alignItems="center">
            <Checkbox
              isSelected={form.active}
              onChange={v => onChange({ active: v })}
            >
              <Text UNSAFE_className="spectrum-FieldLabel spectrum-FieldLabel--sizeS" UNSAFE_style={{ fontWeight: 400, fontSize: '0.9em' }}>
                Active
              </Text>
            </Checkbox>
            <Checkbox
              isSelected={form.tracking_available}
              onChange={v => onChange({ tracking_available: v })}
            >
              <Text UNSAFE_className="spectrum-FieldLabel spectrum-FieldLabel--sizeS" UNSAFE_style={{ fontWeight: 400, fontSize: '0.9em' }}>
                Tracking available
              </Text>
            </Checkbox>
            <Checkbox
              isSelected={form.shipping_labels_available}
              onChange={v => onChange({ shipping_labels_available: v })}
            >
              <Text UNSAFE_className="spectrum-FieldLabel spectrum-FieldLabel--sizeS" UNSAFE_style={{ fontWeight: 400, fontSize: '0.9em' }}>
                Shipping labels available
              </Text>
            </Checkbox>
          </Flex>

          <View marginTop="size-300">
            <Text
              UNSAFE_className="spectrum-FieldLabel spectrum-FieldLabel--sizeS"
              UNSAFE_style={{ display:'block', marginBottom:4, fontWeight:400, fontSize:'0.9em' }}
            >
              Customer Groups
            </Text>
            <ListBox
              aria-label="Customer groups"
              selectionMode="multiple"
              selectedKeys={new Set(form.customer_groups)}
              onSelectionChange={keys => onChange({ customer_groups: Array.from(keys).map(String) })}
              width="100%"
              UNSAFE_style={{ maxHeight:220, overflow:'auto', border:'1px solid var(--spectrum-alias-border-color)' }}
            >
              {groupOptions.map(opt => (
                <Item key={opt.id}>{opt.label}</Item>
              ))}
            </ListBox>
            {!groupsSelected && (
              <View marginTop="size-100" UNSAFE_style={{ color:'crimson' }}>
                Select at least one customer group.
              </View>
            )}
            {groupsLoading && <View marginTop="size-100">Loading groups…</View>}
          </View>

          {error && <View marginTop="size-200" UNSAFE_style={{ color:'crimson' }}>{error}</View>}
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

export { CarrierDialog };
