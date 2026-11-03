import { ScrollView, Text, View } from "react-native";

import { AppButton, Avatar, Badge, Poster, SectionLabel } from "../";
import { WizardFooter } from "./WizardFooter";
import { firstName } from "../../lib/avatar";
import { formatShortDate } from "../../lib/date";
import { formatYearRuntime } from "../../lib/movies";
import { nightPicker, type Night } from "../../lib/nights";
import { borderWidth, createThemedStyles, fontFamily, fontSize, lh, radius, space, tabular, textPresets } from "../../theme";

const POSTER_W = 150;
const POSTER_H = 225;
const STACK_AVATAR = 36;

// RecordedView is the "We watched it" flow's Done screen (board 07): the
// receipt of a Night just recorded as watched. The film leads, centred under
// its poster (or the hue tile), with "Recorded ✓", year · runtime (what we
// have), the picker's credit and who watched. The one primary action, Done,
// leaves the flow; Change film is a quiet ghost under it. The badge is
// neutral: the accent is only on Done.
export function RecordedView({
  night,
  onDone,
  onChangeFilm,
}: {
  night: Night;
  onDone: () => void;
  onChangeFilm: () => void;
}) {
  const styles = useStyles();
  const movie = night.movie;
  const picker = nightPicker(night);
  const details = movie !== null ? formatYearRuntime(movie) : "";
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          {movie !== null ? (
            <View style={styles.posterShadow}>
              <Poster
                uri={movie.posterUrl}
                title={movie.title}
                year={movie.releaseYear ?? undefined}
                w={POSTER_W}
                h={POSTER_H}
                rounded={radius.md}
              />
            </View>
          ) : null}
          <View style={styles.badge}>
            <Badge label="Recorded ✓" tone="neutral" />
          </View>
          {movie !== null ? <Text style={styles.title}>{movie.title}</Text> : null}
          {details !== "" ? <Text style={styles.details}>{details}</Text> : null}
          {picker !== null ? (
            <Text style={styles.credit}>
              {"Picked by "}
              <Text style={styles.creditName}>{firstName(picker.name)}</Text>
              {` · ${formatShortDate(night.scheduledFor)}`}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionLabel marginTop={28}>Who watched</SectionLabel>
        </View>
        <View style={styles.stack} accessibilityLabel={night.attendees.map((a) => a.name).join(", ")}>
          {night.attendees.map((a, i) => (
            <View key={a.id} style={[styles.stackChip, i > 0 && styles.stackOverlap]}>
              <Avatar name={a.name} size={STACK_AVATAR} />
            </View>
          ))}
        </View>
      </ScrollView>

      <WizardFooter>
        <AppButton title="Done" fullWidth onPress={onDone} />
        <View style={styles.secondary}>
          <AppButton title="Change film" variant="ghost" size="sm" onPress={onChangeFilm} />
        </View>
      </WizardFooter>
    </View>
  );
}

const useStyles = createThemedStyles((colors, shadow) => ({
  flex: { flex: 1 },
  content: { paddingHorizontal: space[5], paddingTop: 14, paddingBottom: space[6] },
  head: { alignItems: "center" },
  posterShadow: { borderRadius: radius.md, ...shadow.lg },
  badge: { marginTop: 22 },
  title: {
    ...textPresets.filmTitle,
    fontSize: 40,
    lineHeight: 44,
    color: colors.text.primary,
    textAlign: "center",
    marginTop: space[3],
  },
  details: {
    ...textPresets.meta,
    ...tabular,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    textAlign: "center",
    marginTop: 6,
  },
  credit: {
    fontFamily: fontFamily.sans,
    ...tabular,
    fontSize: 15,
    lineHeight: lh(15),
    color: colors.text.secondary,
    textAlign: "center",
    marginTop: 18,
  },
  creditName: { fontFamily: fontFamily.sansSemibold, color: colors.text.primary },
  section: { alignItems: "center" },
  stack: { flexDirection: "row", justifyContent: "center", flexWrap: "wrap" },
  // A 2px ring in the page colour separates the overlapping faces.
  stackChip: {
    borderRadius: radius.full,
    boxShadow: `0 0 0 ${borderWidth.ring}px ${colors.surface.page}`,
  },
  stackOverlap: { marginLeft: -6 },
  secondary: { alignItems: "center" },
}));
