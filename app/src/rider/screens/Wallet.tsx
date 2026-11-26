// Balance, withdraw and payout history (shown on the Earnings tab), and the bank account screen.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { AmountRow, Button, Card, Divider, Field, Header, Row, Tag, Txt } from '../components/ui';
import { Icon } from '../components/Icon';
import { useNav } from '../nav';
import { colors, font, radius } from '../../theme';
import { backend } from '../api';
import type { Bank, PayoutItem, Wallet } from '../api/types';
import { naira } from '../lib/format';
import { onNotification } from '../../lib/push';

const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUS: Record<PayoutItem['status'], { label: string; tone: 'primary' | 'accent' | 'plain' }> = {
  paid: { label: 'Sent', tone: 'primary' },
  processing: { label: 'On its way', tone: 'accent' },
  failed: { label: 'Did not go through', tone: 'plain' },
};

/** Card on the Earnings tab: what Arodan owes the rider now, the Withdraw button and recent payouts. */
export function WalletCard({ refreshKey }: { refreshKey?: unknown }) {
  const { push } = useNav();
  const [w, setW] = useState<Wallet | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setW(await backend.wallet());
      setErr('');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load your balance.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  // "Payout sent" / "did not go through" notifications refresh the card.
  useEffect(() => onNotification((d) => { if (d.type === 'wallet') load(); }), [load]);

  const withdraw = async () => {
    setBusy(true);
    setNote('');
    try {
      const r = await backend.withdraw();
      setW(r.wallet);
      setNote(r.payout.status === 'failed' ? 'The payout did not go through. Your money is still in your balance.'
        : r.payout.status === 'paid' ? `${naira(r.payout.amount)} sent to your bank.` : `${naira(r.payout.amount)} is on its way to your bank.`);
    } catch (e: any) {
      setNote(e?.message ?? 'Could not withdraw. Try again.');
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!w) return err ? <Txt color={colors.danger}>{err}</Txt> : <ActivityIndicator color={colors.primary} />;
  const b = w.balance;
  const hold = w.bankAccount && new Date(w.bankAccount.payoutsFrom) > new Date();
  const inFlight = w.payouts.some((p) => p.status === 'processing');
  const canWithdraw = w.payoutsEnabled && !!w.bankAccount && !hold && !inFlight && b.available >= w.minWithdrawal;
  const showBreakdown = b.errandSpend !== 0 || b.cashCollected !== 0 || b.adjustments !== 0;

  return (
    <>
      <Card tint style={{ gap: 6 }}>
        <Txt v="label" color={colors.primary}>Balance to withdraw</Txt>
        <Txt v="h1" style={{ fontSize: 36, lineHeight: 42 }} color={b.available < 0 ? colors.danger : colors.ink}>{naira(b.available)}</Txt>
        {showBreakdown && (
          <View style={{ marginTop: 4 }}>
            <AmountRow label={`Earnings (${b.drops} ${b.drops === 1 ? 'drop' : 'drops'})`} value={naira(b.earned)} />
            {b.errandSpend !== 0 && <AmountRow label="Errand money you spent" value={naira(b.errandSpend)} />}
            {b.cashCollected !== 0 && <AmountRow label="Pay-on-delivery cash you hold" value={`−${naira(b.cashCollected)}`} />}
            {b.adjustments !== 0 && <AmountRow label="Added by Arodan" value={(b.adjustments < 0 ? '−' : '') + naira(Math.abs(b.adjustments))} />}
          </View>
        )}
        {b.available < 0 && <Txt v="small" color={colors.ink}>You are holding more cash than you have earned. Hand the cash in to Arodan to clear it.</Txt>}
        <Button title={inFlight ? 'Payout on its way' : 'Withdraw to bank'} icon="bank" onPress={withdraw} loading={busy} disabled={!canWithdraw} style={{ marginTop: 8 }} />
        {note ? <Txt v="small" color={colors.ink} style={{ textAlign: 'center' }}>{note}</Txt> : null}
        <Txt v="small" color={colors.ink} style={{ textAlign: 'center' }}>
          {!w.payoutsEnabled ? 'Bank payouts are being set up. Your earnings are safe in your balance.'
            : !w.bankAccount ? 'Add your bank account to get paid.'
            : hold ? `Your new account can receive payouts from ${when(w.bankAccount.payoutsFrom)}.`
            : b.available < w.minWithdrawal ? `You can withdraw from ${naira(w.minWithdrawal)}.`
            : w.autoPayoutHour !== null ? `Or wait: we pay your balance automatically every night at ${hourLabel(w.autoPayoutHour)}.`
            : ''}
        </Txt>
      </Card>

      <Card onPress={() => push({ name: 'bank' })} style={{ padding: 16 }}>
        <Row style={{ gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bank" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            {w.bankAccount ? (
              <>
                <Txt v="h3">{w.bankAccount.bankName}</Txt>
                <Txt v="small">{w.bankAccount.accountNumber} · {w.bankAccount.accountName}</Txt>
              </>
            ) : (
              <>
                <Txt v="h3">Add bank account</Txt>
                <Txt v="small">Where we send your earnings</Txt>
              </>
            )}
          </View>
          <Icon name="chevron" size={18} color={colors.muted} />
        </Row>
      </Card>

      {w.payouts.length > 0 && (
        <>
          <Txt v="h3" style={{ marginTop: 4 }}>Payouts</Txt>
          <Card style={{ gap: 0, paddingVertical: 6 }}>
            {w.payouts.slice(0, 8).map((p, i) => (
              <Row key={p.id} style={{ gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt v="h3">{naira(p.amount)}</Txt>
                  <Txt v="small">{when(p.createdAt)} · {p.bankName.split(' ')[0]} {p.accountNumber}{p.trigger === 'auto' ? ' · nightly' : ''}</Txt>
                  {p.status === 'failed' && p.failureReason ? <Txt v="small" color={colors.danger}>{p.failureReason}</Txt> : null}
                </View>
                <Tag label={STATUS[p.status].label} tone={STATUS[p.status].tone} />
              </Row>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

/** Choose a bank, type the 10-digit account number, see the name the bank has, then save. */
export function BankAccountScreen() {
  const { pop } = useNav();
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [current, setCurrent] = useState<Wallet['bankAccount']>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [number, setNumber] = useState('');
  const [checked, setChecked] = useState<{ key: string; name: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    backend.banks().then(setBanks).catch((e) => setErr(e?.message ?? 'Could not load banks.'));
    backend.wallet().then((w) => setCurrent(w.bankAccount)).catch(() => {});
  }, []);

  // Look the name up as soon as the number is complete.
  const key = bank && number.length === 10 ? `${bank.code}:${number}` : '';
  useEffect(() => {
    if (!key || !bank) return setChecked(null);
    let live = true;
    setChecking(true);
    setErr('');
    backend
      .checkBankAccount(bank.code, number)
      .then((r) => live && setChecked({ key, name: r.accountName }))
      .catch((e) => live && (setChecked(null), setErr(e?.message ?? 'Could not check this account.')))
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, [key]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (banks ?? []).filter((b) => !t || b.name.toLowerCase().includes(t));
  }, [banks, q]);

  const save = async () => {
    if (!bank || !checked) return;
    setSaving(true);
    setErr('');
    try {
      await backend.saveBankAccount(bank.code, number);
      pop();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (picking) {
    return (
      <View style={{ flex: 1 }}>
        <Header title="Choose your bank" onBack={() => setPicking(false)} />
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <Row style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 16, gap: 8, height: 50 }}>
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search banks" placeholderTextColor="#94A39B" autoFocus
              style={{ flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.ink }} />
          </Row>
        </View>
        {!banks ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : (
          <FlatList
            data={shown}
            keyExtractor={(b) => b.code}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => { setBank(item); setPicking(false); setQ(''); }} style={{ paddingVertical: 15, borderBottomWidth: 1, borderColor: colors.line }}>
                <Txt weight={bank?.code === item.code ? 'semibold' : 'regular'} color={bank?.code === item.code ? colors.primary : colors.ink}>{item.name}</Txt>
              </Pressable>
            )}
            ListEmptyComponent={<Txt color={colors.muted} style={{ marginTop: 20 }}>No bank matches "{q}".</Txt>}
          />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="Bank account" onBack={pop} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        {current && (
          <Card style={{ gap: 4 }}>
            <Txt v="label">Payouts go to</Txt>
            <Txt v="h3">{current.bankName} {current.accountNumber}</Txt>
            <Txt v="small">{current.accountName}</Txt>
          </Card>
        )}
        <Txt color={colors.muted}>{current ? 'To change it, enter your new account.' : 'Your earnings are sent here.'} The account must be in your own name.</Txt>

        <View style={{ gap: 6 }}>
          <Txt v="label">Bank</Txt>
          <Pressable onPress={() => setPicking(true)} style={{ backgroundColor: colors.surface, borderRadius: radius.small, paddingHorizontal: 16, minHeight: 52, flexDirection: 'row', alignItems: 'center' }}>
            <Txt style={{ flex: 1 }} color={bank ? colors.ink : '#94A39B'}>{bank?.name ?? 'Choose your bank'}</Txt>
            <Icon name="chevron" size={18} color={colors.muted} />
          </Pressable>
        </View>
        <Field label="Account number" value={number} onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad" placeholder="10 digits" maxLength={10} style={{ letterSpacing: 2 }} />

        {checking && <Row style={{ gap: 8 }}><ActivityIndicator color={colors.primary} /><Txt color={colors.muted}>Checking with your bank…</Txt></Row>}
        {checked && checked.key === key && (
          <Card tint style={{ gap: 4 }}>
            <Row style={{ gap: 8 }}>
              <Icon name="check" size={18} color={colors.primary} />
              <Txt v="h3">{checked.name}</Txt>
            </Row>
            <Txt v="small" color={colors.ink}>This is the name your bank has for this account. Only save it if it is yours.</Txt>
          </Card>
        )}
        {err ? <Txt color={colors.danger}>{err}</Txt> : null}
        {current && <><Divider /><Txt v="small">For your safety, a new account can receive payouts 24 hours after you change it.</Txt></>}
        <Button title={current ? 'Change account' : 'Save account'} onPress={save} loading={saving} disabled={!checked || checked.key !== key} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
