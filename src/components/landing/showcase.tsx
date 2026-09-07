import { FeatureAnimation } from "./feature-animation";
import styles from "./landing.module.css";

const features = [
  {
    title: "Explore.",
    kind: "explore",
    body: "Pick an activity. Try something you haven’t tried before.",
  },
  {
    title: "Connect.",
    kind: "connect",
    body: "A shared space to ask questions and think out loud.",
  },
  {
    title: "Make it a habit.",
    kind: "habit",
    body: "Pick up where you left off and keep your streak going.",
  },
] as const;

export function Showcase() {
  return (
    <div className={styles.container}>
      <section
        id="explore"
        className={styles.explore}
        aria-labelledby="explore-heading"
      >
        <h2 id="explore-heading" className={styles.exploreHeading}>Follow your curiosity</h2>
        <p className={styles.intro}>
          Explore activities, find your people, and come back for more.
        </p>
        <div className={styles.features}>
          {features.map(({ title, body, kind }) => (
            <div key={title} className={styles.feature}>
              <FeatureAnimation kind={kind} />
              <div className={styles.featureCopy}>
              <h3>{title}</h3>
              <p>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
