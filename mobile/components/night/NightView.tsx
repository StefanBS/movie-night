import { type ComponentProps } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { CalendarPlus, Clapperboard, Film, Pencil, X } from "lucide-react-native";

import { AppButton, Avatar, Poster, SectionLabel, Sheet, SheetRow, useToast } from "../";
import { Credit } from "./Credit";
import { WizardFooter } from "./WizardFooter";
import { addToCalendar } from "../../calendarExport";
import { firstName } from "../../lib/avatar";
import { formatShortDate, formatWeekdayDate } from "../../lib/date";
import type { Member } from "../../lib/members";
import { nightMeta, nightWording } from "../../lib/nightLifecycle";
import type { Night } from "../../lib/nights";
import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, radius, space, tabular, textPresets, useColors } from "../../theme";

type SheetAction = Omit<ComponentProps<typeof SheetRow>, "last">;

// NightView is the one screen for every saved night, past, tonight or ahead.
// The film leads, beside its poster (or an empty slot), and the picker is a
// credit line under it. A night without a film has one primary action, "Choose
// the film"; a night with one has none. The secondary actions (Change film,
// Edit night, Add to calendar, Clear film) sit in the sheet behind the ⋯
// button, which the editor's top bar opens through moreOpen. `today` is passed
// in (mirrors lib/date.ts) for deterministic date framing.
export function NightView({
  night,
  members,
  today,
  moreOpen,
  onCloseMore,
  onPickFilm,
  onClearFilm,
  onEdit,
}: {
  night: Night;
  members: Member[];
  today: string;
  moreOpen: boolean;
  onCloseMore: () => void;
  onPickFilm: () => void;
  onClearFilm?: () => void;
  onEdit?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const toast = useToast();
  const wording = nightWording(night.scheduledFor, today);
  const movie = night.movie;
  const pickerName =
    night.attendees.find((a) => a.id === night.pickerId)?.name ??
    members.find((m) => m.id === night.pickerId)?.name ??
    "";
  const first = firstName(pickerName);
  const onAddToCalendar = async () => {
    if ((await addToCalendar(night)) === "saved") {
      toast({ title: "Added to your calendar", body: "It won't follow later changes to the night." });
    }
  };

  // Each action closes the sheet before it runs.
  const act = (run: () => void) => () => {
    onCloseMore();
    run();
  };
  const actions: SheetAction[] = [];
  if (movie !== null) {
    actions.push({ icon: Film, label: "Change film", sub: `Keeps the night and ${first}'s pick`, onPress: act(onPickFilm) });
  }
  if (onEdit !== undefined) {
    actions.push({ icon: Pencil, label: "Edit night", sub: wording.editSub, onPress: act(onEdit) });
  }
  // The OS calendar form has no web version.
  if (wording.canAddToCalendar && Platform.OS !== "web") {
    actions.push({
      icon: CalendarPlus,
      label: "Add to calendar",
      sub: "A one-off event on this phone",
      onPress: act(() => void onAddToCalendar()),
    });
  }
  if (movie !== null && onClearFilm !== undefined) {
    actions.push({
      icon: X,
      label: "Clear film",
      sub: "The night stays; the film is removed",
      danger: true,
      onPress: act(onClearFilm),
    });
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          {movie !== null ? (
            <Poster uri={movie.posterUrl} title={movie.title} w={120} h={180} />
          ) : (
            <View style={styles.emptyPoster}>
              <Clapperboard size={28} color={colors.text.tertiary} />
            </View>
          )}
          <View style={styles.headText}>
            <Text style={styles.meta}>{nightMeta(night.scheduledFor, night.startTime, today)}</Text>
            {movie !== null ? (
              <Text style={styles.filmTitle} numberOfLines={4}>
                {movie.title}
              </Text>
            ) : (
              <Text style={[styles.filmTitle, styles.notPicked]}>Not picked yet.</Text>
            )}
            {movie !== null && movie.releaseYear !== null ? (
              <Text style={styles.year}>{movie.releaseYear}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.credit}>
          <Credit name={pickerName} pending={movie === null} />
        </View>
        {movie === null && wording.pickerNote !== null ? (
          <Text style={styles.note}>{wording.pickerNote(first)}</Text>
        ) : null}

        <SectionLabel>{wording.attendeesSection(night.attendees.length)}</SectionLabel>
        {night.attendees.map((a, i) => (
          <View key={a.id} style={[styles.person, i < night.attendees.length - 1 && styles.divider]}>
            <Avatar name={a.name} size={32} />
            <Text style={styles.personName} numberOfLines={1}>
              {a.name}
            </Text>
            {a.id === night.pickerId ? <Text style={styles.tag}>Picker</Text> : null}
          </View>
        ))}
      </ScrollView>

      {movie === null ? (
        <WizardFooter>
          <AppButton title="Choose the film" fullWidth onPress={onPickFilm} />
        </WizardFooter>
      ) : null}

      <Sheet
        visible={moreOpen}
        title={movie !== null ? `${movie.title} · ${formatShortDate(night.scheduledFor)}` : formatWeekdayDate(night.scheduledFor)}
        onClose={onCloseMore}
      >
        {actions.map((a, i) => (
          <SheetRow key={a.label} {...a} last={i === actions.length - 1} />
        ))}
      </Sheet>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => ({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[6] },
  head: { flexDirection: "row", alignItems: "flex-end", gap: 18, marginTop: 10 },
  // The slot a poster will fill: a poster-shaped outline around a clapperboard.
  emptyPoster: {
    width: 120,
    height: 180,
    borderRadius: radius.sm,
    borderWidth: borderWidth.regular,
    borderColor: colors.border.strong,
    alignItems: "center",
    justifyContent: "center",
  },
  headText: { flex: 1, minWidth: 0, paddingBottom: space[1] },
  meta: { fontFamily: fontFamily.sansSemibold, fontSize: 13, lineHeight: lh(13), color: colors.text.secondary },
  filmTitle: { ...textPresets.filmTitle, fontSize: 32, lineHeight: 36, color: colors.text.primary, marginTop: space[2] },
  notPicked: { color: colors.text.tertiary },
  year: { ...textPresets.meta, ...tabular, color: colors.text.tertiary, marginTop: space[2] },
  credit: {
    marginTop: 22,
    paddingTop: space[4],
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.border.hairline,
  },
  note: { ...textPresets.meta, lineHeight: lh(fontSize.sm, "normal"), color: colors.text.secondary, marginTop: 14 },
  person: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: 10 },
  divider: { borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.border.hairline },
  personName: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.base, lineHeight: lh(fontSize.base), color: colors.text.primary },
  tag: { ...textPresets.meta, fontSize: 13, color: colors.text.tertiary },
}));
