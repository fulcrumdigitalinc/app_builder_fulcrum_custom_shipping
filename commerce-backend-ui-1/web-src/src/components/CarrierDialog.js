import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog, Heading, Divider, Content, ButtonGroup, Button,
  Form, TextField, NumberField, Item, Checkbox,
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

  // ---------- STATE ----------
  const [form, setForm] = useState(() => {
    const storesArr    = Array.isArray(initialData?.stores) ? initialData.stores : [];
    const countriesArr = Array.isArray(initialData?.countries) ? initialData.countries : [];
    return {
      code: (initialData?.code ?? '').toString(),
      title: (initialData?.title ?? '').toString(),
      stores: (storesArr.length
        ? storesArr.map(String)
        : [initialData?.store ?? getDefaultStore()].filter(Boolean).map(String)),
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
  const [inlineError, setInlineError] = useState('');
  const [codeError, setCodeError] = useState('');

  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupOptions, setGroupOptions]   = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storeOptions, setStoreOptions]   = useState([]);
  const [existingCodes, setExistingCodes] = useState([]);

  // ---------- LOADERS ----------
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
        setInlineError(`Error loading customer groups: ${e.message}`);
      } finally {
        if (alive) setGroupsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

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

        if ((form.stores || []).length === 0 && normalized.length) {
          const def = normalized.find(s => s.id === 'default')?.id ?? normalized[0].id;
          setForm(prev => ({ ...prev, stores: [def] }));
        }
      } catch (e) {
        if (!alive) return;
        setInlineError(prev => prev || `Error loading stores: ${e.message}`);
      } finally {
        if (alive) setStoresLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStores]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(GET_CARRIERS_URL);
        const json = await res.json();
        const items = Array.isArray(json?.carriers) ? json.carriers : [];
        if (!alive) return;
        const codes = items.map(c => String(c.code).trim()).filter(Boolean);
        setExistingCodes(codes);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

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

  // ---------- HELPERS ----------
  const onChange = (patch) => {
    if (Object.prototype.hasOwnProperty.call(patch, 'code')) setCodeError('');
    setInlineError('');
    setForm(prev => ({ ...prev, ...patch }));
  };

  const codeTrimmed    = (form.code || '').trim();
  const groupsSelected = (form.customer_groups && form.customer_groups.length > 0);
  const storesSelected = (form.stores && form.stores.length > 0);
  const validSortOrder = (form.sort_order === '' || /^\d+$/.test(form.sort_order));
  const isDuplicateCode = useMemo(() => {
    if (mode !== 'add') return false;
    if (!codeTrimmed) return false;
    return existingCodes.includes(codeTrimmed);
  }, [mode, codeTrimmed, existingCodes]);

  const canSave = useMemo(() => {
    if (!codeTrimmed || !form.title?.trim()) return false;
    if (!validSortOrder) return false;
    if (!groupsSelected) return false;
    if (!storesSelected) return false;
    if (isDuplicateCode) return false;
    return true;
  }, [codeTrimmed, form.title, validSortOrder, groupsSelected, storesSelected, isDuplicateCode]);

  const extractBackendMessage = (json) => {
    if (json?.message && typeof json.message === 'string') return json.message;
    if (json?.data) {
      try {
        const inner = typeof json.data === 'string' ? JSON.parse(json.data) : json.data;
        if (inner?.message && typeof inner.message === 'string') return inner.message;
        if (typeof inner === 'string') return inner;
        if (Array.isArray(inner) && inner.length) return String(inner[0]);
      } catch { /* ignore */ }
      if (typeof json.data === 'string') return json.data;
    }
    if (typeof json === 'string') return json;
    return null;
  };

  // Auto-select first two groups ONCE (initial mount only)
  const didAutoSelectGroups = useRef(false);
  useEffect(() => {
    if (didAutoSelectGroups.current) return;
    if (mode !== 'add') return;
    if (groupsLoading) return;
    if (groupOptions.length === 0) return;
    if ((form.customer_groups || []).length > 0) {
      didAutoSelectGroups.current = true;
      return;
    }
    const defaults = groupOptions.slice(0, 2).map(g => g.id);
    if (defaults.length > 0) setForm(prev => ({ ...prev, customer_groups: defaults }));
    didAutoSelectGroups.current = true;
  }, [mode, groupsLoading, groupOptions]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setInlineError('');
      setCodeError('');

      const storesArr    = (form.stores || []).map(String).filter(Boolean);
      const countriesArr = (form.countries || []).map(String).filter(Boolean);

      const sortOrderEmpty  = form.sort_order === '';
      const sortOrderNumber = /^\d+$/.test(form.sort_order) ? Number(form.sort_order) : NaN;

      const native = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        code: codeTrimmed,
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
        ...(typeof form.price_per_item === 'boolean') ? { price_per_item: form.price_per_item } : {}
      };

      const payload = { ...native, variables };

      const res = await fetch(ADD_CARRIER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carrier: payload })
      });

      const json = await res.json();

      // Backend now always returns 200; also check logical ok flag
      if (!res.ok || json?.ok === false) {
        const msg = extractBackendMessage(json) || 'Unexpected error while saving carrier';
        setInlineError(msg);
        if (String(msg).toLowerCase().includes('already exists')) setCodeError(msg);
        return;
      }

      setExistingCodes(prev => Array.from(new Set([...prev, codeTrimmed])));

      onSuccess && onSuccess(json);
      onClose && onClose();
    } catch (e) {
      setInlineError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ---- Uniform field wrapper with Spectrum label classes ----
  const FieldBlock = ({ id, label, children }) => (
    <View UNSAFE_className="spectrum-Field" UNSAFE_style={{ width: '100%' }}>
      <Text
        id={id}
        elementType="label"
        UNSAFE_className="spectrum-FieldLabel spectrum-FieldLabel--sizeM"
        UNSAFE_style={{ display: 'block', marginBottom: 4 }}
      >
        {label}
      </Text>
      <div className="spectrum-FieldField">{children}</div>
    </View>
  );

  // Always-defined list of stores
  const storesList = useMemo(() => {
    if (storeOptions && storeOptions.length) return storeOptions;
    if (Array.isArray(allStores)) {
      return allStores.map(s => ({ id: String(s.id), name: s.name ?? String(s.id) }));
    }
    return [];
  }, [storeOptions, allStores]);

  return (
    <Dialog>
      <Heading>Add Carrier</Heading>
      <Divider />
      <Content>
        <Form maxWidth="100%">
          {/* Row 1: Code + Title */}
          <Grid columns={['1fr', '1fr']} gap="size-200" alignItems="end">
            <FieldBlock id="code-label" label="Code *">
              <TextField
                aria-labelledby="code-label"
                value={form.code}
                onChange={(v) => onChange({ code: v })}
                isDisabled={mode === 'edit'}
                validationState={(codeError || isDuplicateCode) ? 'invalid' : undefined}
                errorMessage={codeError || (isDuplicateCode ? 'Code already exists. Choose a different code.' : undefined)}
                width="100%"
              />
            </FieldBlock>

            <FieldBlock id="title-label" label="Title *">
              <TextField
                aria-labelledby="title-label"
                value={form.title}
                onChange={(v) => onChange({ title: v })}
                width="100%"
              />
            </FieldBlock>
          </Grid>

          {/* Row 2: Method Name + Stores (align tops) */}
          <Grid columns={['1fr', '1fr']} gap="size-200" alignItems="start" marginTop="size-200">
            <FieldBlock id="method-label" label="Method Name">
              <TextField
                aria-labelledby="method-label"
                value={form.method_name || ''}
                onChange={(v) => onChange({ method_name: v })}
                width="100%"
              />
            </FieldBlock>

            <FieldBlock id="stores-label" label="Stores *">
              <ListBox
                aria-labelledby="stores-label"
                selectionMode="multiple"
                selectedKeys={new Set(form.stores || [])}
                onSelectionChange={(keys) => {
                  const allIds = storesList.map(s => String(s.id));
                  const arr = keys === 'all' ? allIds : Array.from(keys || []).map(String);
                  onChange({ stores: arr });
                }}
                width="100%"
                UNSAFE_style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--spectrum-alias-border-color)' }}
              >
                {storesList.map(s => (
                  <Item key={String(s.id)}>{s.name ?? s.id}</Item>
                ))}
              </ListBox>
            </FieldBlock>
          </Grid>

          {/* Row 3: Price / Minimum / Maximum / Sort order */}
          <Flex gap="size-300" marginTop="size-200" alignItems="end" wrap>
            <View width="size-1000">
              <FieldBlock id="price-label" label="Price">
                <NumberField
                  aria-labelledby="price-label"
                  hideStepper
                  value={form.value}
                  onChange={(v) => onChange({ value: Number.isFinite(v) ? v : null })}
                  width="100%"
                />
              </FieldBlock>
            </View>

            <View width="size-1000">
              <FieldBlock id="min-label" label="Minimum">
                <NumberField
                  aria-labelledby="min-label"
                  hideStepper
                  value={form.minimum}
                  onChange={(v) => onChange({ minimum: Number.isFinite(v) ? v : null })}
                  width="100%"
                />
              </FieldBlock>
            </View>

            <View width="size-1000">
              <FieldBlock id="max-label" label="Maximum">
                <NumberField
                  aria-labelledby="max-label"
                  hideStepper
                  value={form.maximum}
                  onChange={(v) => onChange({ maximum: Number.isFinite(v) ? v : null })}
                  width="100%"
                />
              </FieldBlock>
            </View>

            <View width="size-1000">
              <FieldBlock id="sort-label" label="Sort order">
                <TextField
                  aria-labelledby="sort-label"
                  inputMode="numeric"
                  value={form.sort_order}
                  onChange={(v) => {
                    const raw = String(v);
                    if (/^\d*$/.test(raw)) onChange({ sort_order: raw });
                  }}
                  width="100%"
                />
              </FieldBlock>
            </View>

            <Checkbox
              isSelected={form.price_per_item}
              onChange={(v) => onChange({ price_per_item: v })}
            >
              Price per item
            </Checkbox>
          </Flex>

          {/* Row 4: Customer Groups (full width) */}
          <Grid columns={['1fr', '1fr']} gap="size-200" marginTop="size-300">
            <View UNSAFE_style={{ gridColumn: '1 / -1' }}>
              <FieldBlock id="groups-label" label="Customer Groups *">
                <ListBox
                  aria-labelledby="groups-label"
                  selectionMode="multiple"
                  selectedKeys={new Set(form.customer_groups)}
                  onSelectionChange={(keys) => {
                    const allIds = groupOptions.map(g => g.id);
                    const arr = keys === 'all' ? allIds : Array.from(keys || []).map(String);
                    onChange({ customer_groups: arr });
                  }}
                  width="100%"
                  UNSAFE_style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--spectrum-alias-border-color)' }}
                >
                  {groupOptions.map(opt => (
                    <Item key={opt.id}>{opt.label}</Item>
                  ))}
                </ListBox>
              </FieldBlock>

              {(!form.customer_groups || form.customer_groups.length === 0) && (
                <View marginTop="size-100" UNSAFE_style={{ color: 'crimson' }}>
                  Select at least one customer group.
                </View>
              )}
              {groupsLoading && <View marginTop="size-100">Loading groups…</View>}
            </View>
          </Grid>

          {inlineError && (
            <View marginTop="size-200" UNSAFE_style={{ color: 'crimson' }}>
              {inlineError}
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
