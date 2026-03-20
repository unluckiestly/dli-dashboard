import WeeklyRecap from './components/WeeklyRecap.tsx';
import styles from './styles/App.module.css';

export default function App() {
  return (
    <div className={styles.container}>
      <WeeklyRecap />
    </div>
  );
}
