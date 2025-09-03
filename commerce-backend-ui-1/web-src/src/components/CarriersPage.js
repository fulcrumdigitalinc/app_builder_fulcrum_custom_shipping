import React, { useEffect, useMemo, useState } from 'react';
import {
  TableView, TableHeader, TableBody, Column, Row, Cell, Flex,
  ProgressCircle, IllustratedMessage, Content, Button,
  DialogTrigger, Dialog, Heading, Divider, ButtonGroup
} from '@adobe/react-spectrum';
import { VisuallyHidden } from '@react-aria/visually-hidden';
import { CarrierDialog } from './CarrierDialog';

const allCountries = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' }
];
const allStores = [{ id: 'default', label: 'Default Store' }];

const getInitialCarrierData = () => ({
  code: '',
  title: '',
  method_name: '',
  stores: ['default'],
  countries: [],
  sort_order: '',
  active: true,
  tracking_available: false,
  shipping_labels_available: false,
  value: '',
  minimum: '',
  maximum: ''
});

export function CarriersPage() {
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editCarrier, setEditCarrier] = useState(null);
  const [deleteCarrier, setDeleteCarrier] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const HEADER_PX = 56;
  const ROW_PX = 48;
  const EXTRA_ROWS_FRACTION = 0.6666;

  const tableHeight = useMemo(() => {
    const rowsWithAir = Math.max(1, carriers.length + EXTRA_ROWS_FRACTION);
    return HEADER_PX + ROW_PX * rowsWithAir;
  }, [carriers.length]);

  const fetchCarriers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/web/FulcrumCustomShippingMenu/get-carriers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      const items = (data.carriers || []).map(c => ({
        ...c,
        stores: Array.isArray(c.stores) ? c.stores : [],
        countries: Array.isArray(c.countries) ? c.countries : [],
        method_name: c.method_name ?? '',
        value: c.value ?? '',
        minimum: c.minimum ?? '',
        maximum: c.maximum ?? ''
      }));
      setCarriers(items);
    } catch {
      setCarriers([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCarriers();
  }, []);

  const handleDialogClose = () => {
    setShowAddDialog(false);
    setEditCarrier(null);
  };

  const handleDialogSuccess = () => {
    fetchCarriers();
    handleDialogClose();
  };

  async function handleDeleteConfirm() {
    if (!deleteCarrier) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/v1/web/FulcrumCustomShippingMenu/delete-carrier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: deleteCarrier.code })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || 'Error deleting carrier');
      setDeleteCarrier(null);
      fetchCarriers();
    } catch (e) {
      alert(e.message || 'Error deleting carrier.');
    }
    setDeleting(false);
  }

  const renderEmptyState = () => (
    <IllustratedMessage><Content>No carriers available</Content></IllustratedMessage>
  );

  return (
    <Flex direction="column" marginX={20}>
      {loading ? (
        <Flex alignItems="center" justifyContent="center" height="100vh">
          <ProgressCircle size="L" aria-label="Loading…" isIndeterminate />
        </Flex>
      ) : (
        <Flex direction="column" width="100%">
          <TableView
            aria-label="carrier table"
            width="100%"
            overflowMode="wrap"
            renderEmptyState={renderEmptyState}
            UNSAFE_style={{ height: tableHeight }}
          >
            <TableHeader>
              <Column>Code</Column>
              <Column>Title</Column>
              <Column width={200}>Method Name</Column>
              <Column width={200}>Stores</Column>
              <Column>Sort Order</Column>
              <Column>Active</Column>
              <Column>Price</Column>
              <Column>Minimum</Column>
              <Column>Maximum</Column>
              <Column width={200}>Actions</Column>
            </TableHeader>
            <TableBody items={carriers}>
              {(carrier) => (
                <Row key={carrier.code}>
                  <Cell>{carrier.code}</Cell>
                  <Cell>{carrier.title}</Cell>
                  <Cell>{carrier.method_name}</Cell>
                  <Cell>{(carrier.stores || []).join(', ')}</Cell>
                  <Cell>{carrier.sort_order ?? ''}</Cell>
                  <Cell>{carrier.active ? 'Yes' : 'No'}</Cell>
                  <Cell>{carrier.value}</Cell>
                  <Cell>{carrier.minimum}</Cell>
                  <Cell>{carrier.maximum}</Cell>
                  <Cell>
                    <Flex gap="size-100">
                      <Button variant="secondary" onPress={() => setEditCarrier(carrier)}>Edit</Button>
                      <Button variant="negative" onPress={() => setDeleteCarrier(carrier)} isDisabled={deleting}>Del</Button>
                    </Flex>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>

          <Flex direction="row" justifyContent="end" marginTop="size-300">
            <Button variant="cta" onPress={() => setShowAddDialog(true)}>Add Carrier</Button>
          </Flex>

          <DialogTrigger type="modal" isOpen={showAddDialog} onOpenChange={setShowAddDialog}>
            <VisuallyHidden><Button>open</Button></VisuallyHidden>
            {showAddDialog && (
              <CarrierDialog
                initialData={getInitialCarrierData()}
                allStores={allStores}
                allCountries={allCountries}
                onClose={handleDialogClose}
                onSuccess={handleDialogSuccess}
                mode="add"
              />
            )}
          </DialogTrigger>

          <DialogTrigger type="modal" isOpen={!!editCarrier} onOpenChange={(open) => { if (!open) setEditCarrier(null); }}>
            <VisuallyHidden><Button>open</Button></VisuallyHidden>
            {editCarrier && (
              <CarrierDialog
                initialData={editCarrier}
                allStores={allStores}
                allCountries={allCountries}
                onClose={handleDialogClose}
                onSuccess={handleDialogSuccess}
                mode="edit"
              />
            )}
          </DialogTrigger>

          <DialogTrigger type="modal" isOpen={!!deleteCarrier} onOpenChange={(open) => { if (!open) setDeleteCarrier(null); }}>
            <VisuallyHidden><Button>open</Button></VisuallyHidden>
            {deleteCarrier && (
              <Dialog>
                <Heading>Are you sure?</Heading>
                <Divider />
                <Content>
                  Delete carrier <b>{deleteCarrier.title || deleteCarrier.code}</b>?<br />
                  This action cannot be undone.
                </Content>
                <ButtonGroup>
                  <Button variant="secondary" onPress={() => setDeleteCarrier(null)}>Cancel</Button>
                  <Button variant="negative" onPress={handleDeleteConfirm} isDisabled={deleting}>
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </Button>
                </ButtonGroup>
              </Dialog>
            )}
          </DialogTrigger>
        </Flex>
      )}
    </Flex>
  );
}

export default CarriersPage;
