import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  type ScrollViewInstance,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { IdentitySession, IdentitySessionState } from "../lib/identity";
import { createThemedStyles, space, textPresets, useColors } from "../theme";
import { AppButton } from "./AppButton";
import { Input } from "./Input";
import { Logomark } from "./Logomark";
import { MemberRow } from "./MemberRow";
import { SectionLabel } from "./SectionLabel";

// ClaimIdentityScreen is the one-time "who are you?" step (ADR-0009): the
// install picks its person from the roster, or adds them as a guest when
// they're not on it. IdentityProvider shows it until the install has an
// identity, so it is a plain component rather than a route.
export function ClaimIdentityScreen({
  session,
  state,
}: {
  session: IdentitySession;
  state: IdentitySessionState;
}) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const scroll = useRef<ScrollViewInstance>(null);

  // The name field sits below the whole roster, and it autofocuses, so the
  // keyboard would open over it and the "Join as a guest" button. The
  // KeyboardAvoidingView shrinks the scroll view to above the keyboard; when it
  // resizes (or the field appears) while adding, scroll to the end so the
  // field and button show. Scrolling on the keyboard event instead races the
  // resize and lands short.
  const showJoin = () => {
    if (adding) {
      scroll.current?.scrollToEnd();
    }
  };

  const join = () => {
    const trimmed = name.trim();
    if (trimmed !== "") {
      void session.joinAndClaim(trimmed);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView
        ref={scroll}
        onLayout={showJoin}
        onContentSizeChange={showJoin}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[8], paddingBottom: insets.bottom + space[8] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Logomark size={56} />
          <Text style={styles.title}>Who are you?</Text>
          <Text style={styles.subtitle}>Pick your name. This phone will remember it.</Text>
        </View>

        {state.status === "loading" ? (
          <ActivityIndicator style={styles.loading} color={colors.text.secondary} />
        ) : state.status === "failed" ? (
          <View style={styles.block}>
            <Text style={styles.errorText}>{`Couldn't load: ${state.error}`}</Text>
            <AppButton title="Try again" variant="secondary" fullWidth onPress={() => void session.load()} />
          </View>
        ) : (
          <>
            <View>
              {state.members.map((m, i) => (
                <MemberRow
                  key={m.id}
                  name={m.name}
                  meta={m.role === "guest" ? "Guest" : undefined}
                  divider={i < state.members.length - 1}
                  onPress={state.busy ? undefined : () => void session.claim(m.id)}
                />
              ))}
            </View>

            {adding ? (
              <View style={styles.block}>
                <SectionLabel>Your name</SectionLabel>
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Alex Rivera"
                  autoFocus
                  onSubmitEditing={join}
                />
                <Text style={styles.helper}>
                  {"You'll join as a guest. The group can add you to the rotation later."}
                </Text>
                <AppButton
                  title="Join as a guest"
                  fullWidth
                  disabled={name.trim() === "" || state.busy}
                  onPress={join}
                />
              </View>
            ) : (
              <View style={styles.block}>
                <AppButton title="I'm not on the list" variant="ghost" fullWidth onPress={() => setAdding(true)} />
              </View>
            )}

            {state.actionError !== null ? <Text style={styles.errorText}>{state.actionError}</Text> : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface.page },
  content: { flexGrow: 1, paddingHorizontal: space[5] },
  header: { alignItems: "center", marginBottom: space[6] },
  title: { ...textPresets.screenTitle, color: colors.text.primary, marginTop: space[4], textAlign: "center" },
  subtitle: { ...textPresets.body, color: colors.text.secondary, marginTop: space[2], textAlign: "center" },
  loading: { marginTop: space[8] },
  block: { marginTop: space[5], gap: space[3] },
  helper: { ...textPresets.body, color: colors.text.tertiary },
  errorText: { ...textPresets.body, color: colors.text.danger, marginTop: space[4] },
}));
