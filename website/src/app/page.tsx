import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import DeepDive from '@/components/DeepDive';
import TechStack from '@/components/TechStack';
import Deployments from '@/components/Deployments';
import BlogSection from '@/components/BlogSection';
import Footer from '@/components/Footer';
import { getAllPosts } from '@/lib/posts';

export default function Home() {
  const posts = getAllPosts();

  return (
    <main>
      <Hero />
      <Features />
      <HowItWorks />
      <DeepDive />
      <TechStack />
      <Deployments />
      <BlogSection posts={posts} />
      <Footer />
    </main>
  );
}
